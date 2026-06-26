/**
 * npm upstream checker for Pi-Tray.
 * Fetches package metadata from npm registry and compares versions.
 */

import { execFileSync } from "child_process";
import { sanitizeForJsonParse } from "./json.js";
import type {
  TrayForkMetadata,
  TrayUpstreamStatus,
  TrayUpstreamVersion,
  TrayUpstreamChange,
} from "./types.js";

/**
 * Check npm registry for newer versions of a forked package.
 * Returns structured status with version list and impact analysis.
 */
export async function checkNpmUpstream(
  fork: TrayForkMetadata,
): Promise<TrayUpstreamStatus> {
  // 1. Fetch package info from npm
  const packageInfo = fetchNpmInfo(fork.package);
  if (!packageInfo) {
    return emptyStatus(fork, "Could not fetch npm info");
  }
  
  const latestVersion = packageInfo["dist-tags"]?.latest ?? "unknown";
  const allVersions: string[] = packageInfo.versions
    ? Object.keys(packageInfo.versions)
    : [];
  
  // 2. Filter versions newer than reviewedUpToVersion
  const newVersions = filterVersionsAfter(allVersions, fork.reviewedUpToVersion);
  
  // 3. For each new version, build change list
  const versions: TrayUpstreamVersion[] = [];
  for (const ver of newVersions) {
    const versionInfo = packageInfo.versions?.[ver];
    const changes: TrayUpstreamChange[] = [];
    
    // Try to get changelog from GitHub releases if repo available
    let changelog: string | undefined;
    if (fork.upstreamRepo) {
      changelog = await fetchGitHubChangelog(fork.upstreamRepo, ver);
    }
    
    // Build basic change entry from version metadata
    const releasedAt = packageInfo.time?.[ver];
    
    versions.push({
      version: ver,
      releasedAt,
      changes,  // Will be populated by detailed diff if available
      changelog,
    });
  }
  
  // 4. Impact analysis
  const modifiedFiles = fork.fileMapping
    .filter(f => f.status !== "unmodified")
    .map(f => f.upstream);
  const unmodifiedFiles = fork.fileMapping
    .filter(f => f.status === "unmodified")
    .map(f => f.upstream);
  
  return {
    fork: {
      name: fork.name,
      package: fork.package,
      currentVersion: fork.forkedFromVersion,
      reviewedToVersion: fork.reviewedUpToVersion,
      latestVersion,
    },
    versions,
    impactAnalysis: {
      affectsModifiedFiles: modifiedFiles,
      affectsUnmodifiedFiles: unmodifiedFiles,
      newFiles: [],
    },
  };
}

/**
 * Fetch npm package info using npm CLI.
 * Returns parsed JSON or null on failure.
 */
function fetchNpmInfo(packageName: string): any | null {
  try {
    const output = execFileSync(
      'npm',
      ['info', packageName, '--json'],
      { encoding: "utf-8", timeout: 15000 },
    );
    return JSON.parse(sanitizeForJsonParse(output.toString()));
  } catch {
    return null;
  }
}

/**
 * Filter versions that come after a given version (semver comparison).
 * Simple string-based comparison -- works for most semver patterns.
 */
function filterVersionsAfter(
  allVersions: string[],
  afterVersion: string,
): string[] {
  // Find the index of afterVersion
  const idx = allVersions.indexOf(afterVersion);
  if (idx === -1) {
    // Version not found -- return all versions (conservative)
    return allVersions.slice(-10); // Last 10 at most
  }
  return allVersions.slice(idx + 1);
}

/**
 * Try to fetch changelog/release notes from GitHub.
 * Returns null if unavailable.
 */
async function fetchGitHubChangelog(
  repoUrl: string,
  version: string,
): Promise<string | undefined> {
  try {
    // Extract owner/repo from GitHub URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return undefined;
    
    const [, owner, repo] = match;
    const tag = version.startsWith("v") ? version : `v${version}`;
    
    // Use GitHub API (no auth needed for public repos)
    const cleanRepo = repo.replace(".git", "");
    const url = `https://api.github.com/repos/${owner}/${cleanRepo}/releases/tags/${tag}`;
    const output = execFileSync(
      'curl',
      ['-sf', url],
      { encoding: "utf-8", timeout: 10000 },
    );
    
    const release = JSON.parse(sanitizeForJsonParse(output));
    return release.body || release.name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Helper: empty status result for error cases.
 */
function emptyStatus(
  fork: TrayForkMetadata,
  error: string,
): TrayUpstreamStatus {
  return {
    fork: {
      name: fork.name,
      package: fork.package,
      currentVersion: fork.forkedFromVersion,
      reviewedToVersion: fork.reviewedUpToVersion,
      latestVersion: "unknown",
    },
    versions: [],
    impactAnalysis: {
      affectsModifiedFiles: [],
      affectsUnmodifiedFiles: [],
      newFiles: [],
    },
  };
}
