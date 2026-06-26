/**
 * Pi-Tray: Fork tracking types.
 * Schema version 2.0 for .pi/forks/<name>/.pi-fork-meta.json
 */

/**
 * Union of ecosystems that pi-tray-lite can record.
 *
 * npm is implemented for upstream checks. Other values are accepted as
 * metadata so forks can record their true ecosystem; unsupported ecosystems
 * return a clear "not yet implemented" response or error.
 */
export type TrayUpstreamType =
  | "npm"
  | "pip"
  | "cargo"
  | "go"
  | "maven"
  | "gem"
  | "nuget"
  | "git"
  | "local";

export interface TrayForkMetadata {
  schemaVersion: "2.0";

  // Identity
  name: string;
  package: string;
  upstreamRepo?: string;
  upstreamType: TrayUpstreamType;
  
  // Fork Point
  forkedFromVersion: string;
  forkedAt: string;
  forkedFromCommit?: string;
  forkReason: string;
  
  // Review Tracking
  reviewedUpToVersion: string;
  reviewedUpToDate: string;
  reviewedUpToCommit?: string;
  
  // File Mapping
  localRoot: string;
  fileMapping: TrayFileMapping[];
  
  // Decision History
  decisions: TrayDecisionRecord[];
  
  // Our Additions
  additions: TrayAddition[];
  
  // Sync Configuration
  syncStrategy: "manual" | "review-required" | "auto-minor";
  checkFrequency?: "daily" | "weekly" | "manual";
  lastChecked?: string;

  notes?: string;

  // Distribution fields (DIST-1) — populated by assemble.ts / distribute.ts
  /** Published npm package name, e.g. "@pi-bakery/pi-example". */
  publishedName?: string;
  /** Current published version, e.g. "1.2.3-pi.0". */
  publishedVersion?: string;
  /** ISO timestamp of last successful assemble. */
  assembledAt?: string;
  /** Projects that have installed this fork. */
  consumers?: TrayForkConsumer[];
}

export interface TrayFileMapping {
  upstream: string;
  local: string;
  status: "unmodified" | "patched" | "heavily_modified" | "diverged" | "local_only";
  patches?: TrayPatch[];
  divergedAt?: string;
}

export interface TrayPatch {
  description: string;
  reason: string;
  date: string;
  lines?: number;
}

export interface TrayDecisionRecord {
  upstreamVersion: string;
  reviewedAt: string;
  reviewedBy: string;
  changes: TrayChangeDecision[];
  summary?: string;
}

export interface TrayChangeDecision {
  changeId: string;
  file: string;
  changeType: "added" | "modified" | "removed" | "renamed";
  description: string;
  decision: TrayDecision;
  reason: string;
  implemented?: boolean;
  implementedAt?: string;
  implementedBy?: string;
  implementationNotes?: string;
}

export type TrayDecision =
  | "cherry_pick"
  | "extract_reimplement"
  | "implement_guidance"
  | "ignore"
  | "defer";

export interface TrayAddition {
  local: string;
  description: string;
  addedAt: string;
  dependsOnUpstream?: string[];
}

// ── Distribution / publishing support (DIST-1) ───────────────────────────────

/**
 * Tracks a consumer project that has installed this fork via `/tray install`.
 */
export interface TrayForkConsumer {
  /** Absolute path to the consuming project. */
  projectPath: string;
  /** ISO timestamp of when this fork was installed. */
  installedAt: string;
  /** Fork version installed, e.g. "1.2.3-pi.0". */
  installedVersion: string;
  /** Which capabilities were installed, or null for whole-fork. */
  capabilityFilter: string[] | null;
  /** UUID from fork_install_records.id. */
  installRecordId: string;
}

// Upstream check results
export interface TrayUpstreamStatus {
  fork: {
    name: string;
    package: string;
    currentVersion: string;
    reviewedToVersion: string;
    /**
     * XPLANG-8: Allow `null` so ecosystem stubs (pip/cargo/go/...) can return a
     * well-formed status without inventing a latest version.
     */
    latestVersion: string | null;
  };
  versions: TrayUpstreamVersion[];
  impactAnalysis: {
    affectsModifiedFiles: string[];
    affectsUnmodifiedFiles: string[];
    newFiles: string[];
  };
  /**
   * XPLANG-8: Optional human-readable notice used by ecosystem stubs
   * (pip/cargo/go/maven/gem/nuget) to explain that upstream checking is not
   * yet implemented for this ecosystem. Absent for fully-supported paths.
   */
  _notice?: string;
}

export interface TrayUpstreamVersion {
  version: string;
  releasedAt?: string;
  changes: TrayUpstreamChange[];
  changelog?: string;
}

export interface TrayUpstreamChange {
  changeId: string;
  file: string;
  changeType: "added" | "modified" | "removed" | "renamed";
  description: string;
  linesAdded?: number;
  linesRemoved?: number;
  diffContent?: string;
}

// Fork status summary
export interface TrayForkStatus {
  name: string;
  package: string;
  forkedFrom: string;
  reviewedTo: string;
  latestUpstream: string | null;
  versionsBehind: number;
  status: "current" | "needs_review" | "pending_implementation" | "unknown";
  pendingDecisions: number;
  mappedFiles: number;
  additions: number;
}

// Legacy v1 schema (for migration)
export interface TrayLegacyMetadata {
  package: string;
  version: string;
  forkedAt: string;
  upstreamRepo?: string;
  reason?: string;
  localPath?: string;
  syncStrategy?: string;
  lastUpstreamCheck?: string;
  notes?: string;
}
