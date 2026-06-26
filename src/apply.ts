import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, join } from "node:path";
import type { TrayChangeDecision } from "./types.js";
import { loadForkMetadata } from "./metadata.js";
import { markImplemented } from "./review.js";

function assertPathInDir(resolvedPath: string, expectedDir: string): void {
	const normalizedResolved = path.resolve(resolvedPath);
	const normalizedExpected = path.resolve(expectedDir);
	if (!normalizedResolved.startsWith(normalizedExpected + path.sep) && normalizedResolved !== normalizedExpected) {
		throw new Error(`Path traversal detected: ${resolvedPath} is outside ${expectedDir}`);
	}
}

export interface ApplyResult {
	success: boolean;
	changeId: string;
	appliedTo?: string;
	dryRun: boolean;
	message?: string;
	error?: string;
}

export interface ApplyOptions {
	/** Defaults to true. Set false to actually copy the upstream file over the mapped local file. */
	dryRun?: boolean;
	/** Defaults to true when dryRun=false. Marks the decision implemented after a successful copy. */
	markImplemented?: boolean;
}

export async function applyNpmChange(
	forkName: string,
	changeId: string,
	targetVersion: string,
	targetFile: string,
	cwd: string,
	options: ApplyOptions = {},
): Promise<ApplyResult> {
	const dryRun = options.dryRun ?? true;
	const meta = loadForkMetadata(forkName, cwd);
	const mapping = meta.fileMapping.find((f) => f.upstream === targetFile || f.local === targetFile);
	if (!mapping) return { success: false, changeId, dryRun, error: `File '${targetFile}' not found in file mapping.` };
	if (mapping.status !== "unmodified") {
		return { success: false, changeId, dryRun, error: `File '${mapping.local}' is ${mapping.status}; auto-apply only supports unmodified mappings.` };
	}

	let tmpDir: string | null = null;
	try {
		tmpDir = mkdtempSync(join(tmpdir(), "tray-apply-"));
		execFileSync("npm", ["pack", `${meta.package}@${targetVersion}`, "--pack-destination", tmpDir], { timeout: 30_000, stdio: "pipe" });
		const tarball = readdirSync(tmpDir).find((f) => f.endsWith(".tgz"));
		if (!tarball) return { success: false, changeId, dryRun, error: "Could not download package tarball." };
		execFileSync("tar", ["-xzf", join(tmpDir, tarball), "-C", tmpDir], { timeout: 10_000 });

		const sourcePath = join(tmpDir, "package", mapping.upstream);
		if (!existsSync(sourcePath)) return { success: false, changeId, dryRun, error: `File '${mapping.upstream}' not found in package tarball.` };
		assertPathInDir(sourcePath, tmpDir);

		const localPath = path.resolve(cwd, mapping.local);
		assertPathInDir(localPath, cwd);

		const upstreamContent = readFileSync(sourcePath, "utf-8");
		const localContent = existsSync(localPath) ? readFileSync(localPath, "utf-8") : "";
		const changed = upstreamContent !== localContent;
		if (dryRun) {
			return { success: true, changeId, appliedTo: mapping.local, dryRun, message: changed ? "Dry run: files differ." : "Dry run: no changes." };
		}

		mkdirSync(dirname(localPath), { recursive: true });
		cpSync(sourcePath, localPath);
		if (options.markImplemented ?? true) markImplemented(forkName, changeId, "tray_apply_change", cwd);
		return { success: true, changeId, appliedTo: mapping.local, dryRun, message: changed ? "File copied." : "File copied; content was already identical." };
	} catch (err) {
		return { success: false, changeId, dryRun, error: err instanceof Error ? err.message : String(err) };
	} finally {
		if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
	}
}

export async function handleTrayApply(
	forkName: string,
	changeId: string,
	cwd: string,
	options: ApplyOptions = {},
): Promise<string> {
	const meta = loadForkMetadata(forkName, cwd);
	let decision: TrayChangeDecision | undefined;
	let version: string | undefined;
	for (const record of meta.decisions) {
		const found = record.changes.find((c) => c.changeId === changeId);
		if (found) { decision = found; version = record.upstreamVersion; break; }
	}
	if (!decision) return `Change '${changeId}' not found in decisions.`;
	if (decision.decision !== "cherry_pick") return `Change '${changeId}' is '${decision.decision}', not cherry_pick.`;
	if (meta.upstreamType !== "npm") return "Auto-apply currently supports npm forks only.";

	const result = await applyNpmChange(forkName, changeId, version!, decision.file, cwd, options);
	if (!result.success) return `Failed to apply ${changeId}: ${result.error}`;
	return `${result.dryRun ? "Dry run complete" : "Applied"} for ${changeId} -> ${result.appliedTo}. ${result.message ?? ""}`;
}
