import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeForJsonParse } from "./json.js";
import type { TrayForkMetadata, TrayForkStatus, TrayLegacyMetadata } from "./types.js";

const FORKS_DIR = ".pi/forks";
const META_FILE = ".pi-fork-meta.json";

export function getForksDir(cwd: string): string {
	return join(cwd, FORKS_DIR);
}

export function listForks(cwd: string): string[] {
	const forksPath = getForksDir(cwd);
	if (!existsSync(forksPath)) return [];
	return readdirSync(forksPath, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.filter((d) => existsSync(join(forksPath, d.name, META_FILE)))
		.map((d) => d.name);
}

export function loadForkMetadata(forkName: string, cwd: string): TrayForkMetadata {
	const metaPath = join(getForksDir(cwd), forkName, META_FILE);
	if (!existsSync(metaPath)) throw new Error(`Fork "${forkName}" not found at ${metaPath}`);
	const raw = JSON.parse(sanitizeForJsonParse(readFileSync(metaPath, "utf-8")));
	if (!raw.schemaVersion) {
		const migrated = migrateLegacyMetadata(raw as TrayLegacyMetadata, forkName);
		saveForkMetadata(forkName, migrated, cwd);
		return migrated;
	}
	return raw as TrayForkMetadata;
}

export function saveForkMetadata(forkName: string, metadata: TrayForkMetadata, cwd: string): void {
	const forkDir = join(getForksDir(cwd), forkName);
	mkdirSync(forkDir, { recursive: true });
	writeFileSync(join(forkDir, META_FILE), JSON.stringify(metadata, null, 2) + "\n", "utf-8");
}

export function migrateLegacyMetadata(legacy: TrayLegacyMetadata, forkName: string): TrayForkMetadata {
	return {
		schemaVersion: "2.0",
		name: forkName,
		package: legacy.package,
		upstreamRepo: legacy.upstreamRepo,
		upstreamType: legacy.upstreamRepo ? "npm" : "local",
		forkedFromVersion: legacy.version,
		forkedAt: legacy.forkedAt,
		forkReason: legacy.reason || "No reason recorded",
		reviewedUpToVersion: legacy.version,
		reviewedUpToDate: legacy.forkedAt,
		localRoot: legacy.localPath || join(FORKS_DIR, forkName, "local"),
		fileMapping: [],
		decisions: [],
		additions: [],
		syncStrategy: "manual",
		lastChecked: legacy.lastUpstreamCheck,
		notes: legacy.notes,
	};
}

export function getForkStatus(metadata: TrayForkMetadata): TrayForkStatus {
	let pendingDecisions = 0;
	for (const record of metadata.decisions) {
		for (const change of record.changes) {
			if (change.decision !== "ignore" && change.decision !== "defer" && !change.implemented) pendingDecisions++;
		}
	}
	return {
		name: metadata.name,
		package: metadata.package,
		forkedFrom: metadata.forkedFromVersion,
		reviewedTo: metadata.reviewedUpToVersion,
		latestUpstream: null,
		versionsBehind: 0,
		status: pendingDecisions > 0 ? "pending_implementation" : "unknown",
		pendingDecisions,
		mappedFiles: metadata.fileMapping.length,
		additions: metadata.additions.length,
	};
}
