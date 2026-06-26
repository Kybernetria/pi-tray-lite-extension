import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { listForks, loadForkMetadata } from "./metadata.js";

export interface TrayHealthCheckReport {
	ok: boolean;
	timestamp: string;
	forkRoot: string;
	forksChecked: number;
	issues: TrayHealthIssue[];
}

export interface TrayHealthIssue {
	forkName?: string;
	severity: "error" | "warning";
	message: string;
}

function isInside(child: string, parent: string): boolean {
	const rel = path.relative(path.resolve(parent), path.resolve(child));
	return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function runHealthCheck(repoRoot: string = process.cwd()): Promise<TrayHealthCheckReport> {
	const issues: TrayHealthIssue[] = [];
	const forkRoot = path.join(repoRoot, ".pi", "forks");
	if (!existsSync(forkRoot)) {
		return { ok: true, timestamp: new Date().toISOString(), forkRoot, forksChecked: 0, issues: [] };
	}
	if (!statSync(forkRoot).isDirectory()) {
		return {
			ok: false,
			timestamp: new Date().toISOString(),
			forkRoot,
			forksChecked: 0,
			issues: [{ severity: "error", message: `${forkRoot} exists but is not a directory` }],
		};
	}

	const forks = listForks(repoRoot);
	for (const forkName of forks) {
		try {
			const meta = loadForkMetadata(forkName, repoRoot);
			if (meta.schemaVersion !== "2.0") issues.push({ forkName, severity: "error", message: "unsupported metadata schema" });
			if (!meta.forkReason?.trim()) issues.push({ forkName, severity: "error", message: "missing fork reason" });
			if (meta.name !== forkName) issues.push({ forkName, severity: "warning", message: `metadata name '${meta.name}' differs from directory '${forkName}'` });
			const localRoot = path.resolve(repoRoot, meta.localRoot || ".");
			if (!isInside(localRoot, repoRoot)) issues.push({ forkName, severity: "error", message: `localRoot escapes repo root: ${meta.localRoot}` });
			for (const mapping of meta.fileMapping) {
				const local = path.resolve(repoRoot, mapping.local);
				if (!isInside(local, repoRoot)) issues.push({ forkName, severity: "error", message: `mapping escapes repo root: ${mapping.local}` });
			}
		} catch (err) {
			issues.push({ forkName, severity: "error", message: err instanceof Error ? err.message : String(err) });
		}
	}

	return {
		ok: !issues.some((issue) => issue.severity === "error"),
		timestamp: new Date().toISOString(),
		forkRoot,
		forksChecked: forks.length,
		issues,
	};
}
