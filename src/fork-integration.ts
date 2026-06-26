import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path, { join } from "node:path";
import type { TrayFileMapping, TrayForkMetadata } from "./types.js";
import { saveForkMetadata } from "./metadata.js";

interface ForkDecision {
	packageName: string;
	packageVersion: string;
	decision: "fork" | "use_as_is" | "learn_only" | "reject";
	rationale: { primary: string; concerns: string[]; benefits?: string[] };
	decisionDate: string;
	forkPath?: string;
	autoApproved: boolean;
}

export interface ForkCreationResult {
	success: boolean;
	forkName: string;
	forkPath?: string;
	metadata?: TrayForkMetadata;
	error?: string;
}

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeForkName(forkPath: string, forkNamespace = "@local"): string {
	const namespacePrefix = forkNamespace.endsWith("/") ? forkNamespace : `${forkNamespace}/`;
	const withoutNamespace = forkPath.replace(new RegExp(`^${escapeRegExp(namespacePrefix)}`), "");
	const name = withoutNamespace.replace(/^@/, "").replace(/\//g, "__");
	if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..") {
		throw new Error(`Invalid fork name derived from '${forkPath}'`);
	}
	return name;
}

function isInside(child: string, parent: string): boolean {
	const rel = path.relative(path.resolve(parent), path.resolve(child));
	return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function createForkFromDecision(
	decision: ForkDecision,
	cwd: string = process.cwd(),
	opts?: { forkNamespace?: string; localRoot?: string },
): Promise<ForkCreationResult> {
	if (decision.decision !== "fork") {
		return { success: false, forkName: "", error: `Decision outcome is '${decision.decision}', not 'fork'.` };
	}
	if (!decision.forkPath) {
		return { success: false, forkName: "", error: "Decision has no forkPath specified." };
	}

	let forkName = "";
	let forkDir = "";
	let createdForkDir = false;
	try {
		forkName = safeForkName(decision.forkPath, opts?.forkNamespace);
		const forksDir = path.resolve(cwd, ".pi", "forks");
		forkDir = join(forksDir, forkName);
		if (!isInside(forkDir, forksDir)) throw new Error(`Fork path escapes fork root: ${forkDir}`);
		if (existsSync(forkDir)) {
			return { success: false, forkName, error: `Fork directory already exists at ${forkDir}.` };
		}

		mkdirSync(forkDir, { recursive: true });
		createdForkDir = true;

		const packOutput = execFileSync(
			"npm",
			["pack", `${decision.packageName}@${decision.packageVersion}`, "--pack-destination", forkDir],
			{ timeout: 30_000, encoding: "utf-8" },
		).trim();
		const tarballPath = join(forkDir, packOutput.split(/\r?\n/).at(-1) ?? "");
		if (!existsSync(tarballPath)) throw new Error(`Package tarball not found at ${tarballPath}`);

		const extractDir = join(forkDir, "upstream-snapshot");
		mkdirSync(extractDir, { recursive: true });
		execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir], { timeout: 10_000 });

		const localRoot = opts?.localRoot ?? `.pi/forks/${forkName}/local`;
		const localRootAbs = path.resolve(cwd, localRoot);
		if (!isInside(localRootAbs, cwd)) throw new Error(`localRoot escapes project root: ${localRoot}`);
		mkdirSync(localRootAbs, { recursive: true });
		const fileMapping = buildFileMappingFromSnapshot(extractDir, localRoot);
		const now = new Date().toISOString();

		const metadata: TrayForkMetadata = {
			schemaVersion: "2.0",
			name: forkName,
			package: decision.packageName,
			upstreamType: "npm",
			forkedFromVersion: decision.packageVersion,
			forkedAt: now,
			forkReason: decision.rationale.primary,
			reviewedUpToVersion: decision.packageVersion,
			reviewedUpToDate: now,
			localRoot,
			fileMapping,
			decisions: [],
			additions: [],
			syncStrategy: "manual",
			lastChecked: now,
			notes: [
				`Created by pi-tray-lite from ${decision.packageName}@${decision.packageVersion}.`,
				decision.rationale.concerns.length ? `Concerns: ${decision.rationale.concerns.join(", ")}` : "",
				decision.rationale.benefits?.length ? `Benefits: ${decision.rationale.benefits.join(", ")}` : "",
			].filter(Boolean).join("\n"),
			publishedName: decision.forkPath,
		};

		saveForkMetadata(forkName, metadata, cwd);
		writeFileSync(join(forkDir, "README.md"), generateForkReadme(metadata, decision), "utf-8");
		return { success: true, forkName, forkPath: forkDir, metadata };
	} catch (err) {
		if (createdForkDir && forkDir) rmSync(forkDir, { recursive: true, force: true });
		return { success: false, forkName, error: err instanceof Error ? err.message : String(err) };
	}
}

function buildFileMappingFromSnapshot(extractDir: string, localRoot: string): TrayFileMapping[] {
	const packageRoot = join(extractDir, "package");
	if (!existsSync(packageRoot)) return [];
	const ignored = new Set(["node_modules", ".git"]);
	const out: TrayFileMapping[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			if (ignored.has(entry)) continue;
			const abs = join(dir, entry);
			const rel = path.relative(packageRoot, abs).split(path.sep).join("/");
			const st = statSync(abs);
			if (st.isDirectory()) walk(abs);
			else if (st.isFile()) out.push({ upstream: rel, local: `${localRoot}/${rel}`, status: "unmodified" });
		}
	};
	walk(packageRoot);
	return out;
}

function generateForkReadme(metadata: TrayForkMetadata, decision: ForkDecision): string {
	return `# Fork: ${metadata.name}

**Forked from:** ${metadata.package}@${metadata.forkedFromVersion}  
**Forked at:** ${metadata.forkedAt}  
**Fork reason:** ${metadata.forkReason}

## Decision Rationale

${decision.rationale.primary}

## Fork Workflow

1. Review \`.pi/forks/${metadata.name}/upstream-snapshot/package/\`.
2. Copy files you modify into \`${metadata.localRoot}/\`.
3. Keep file mapping statuses accurate in \`.pi-fork-meta.json\`.
4. Use \`tray_check_upstream\`, \`tray_record_decision\`, then \`tray_apply_change\` with dry-run first.

## Notes

${metadata.notes || "No additional notes."}
`;
}
