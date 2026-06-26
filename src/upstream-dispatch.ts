/**
 * XPLANG-8: Ecosystem-aware dispatch for `tray_check_upstream`.
 *
 * npm is implemented; pip/cargo/go/maven/gem/nuget return a well-formed
 * "not yet implemented" stub so callers don't crash. `git` and `local` are
 * recorded metadata types but are not auto-checked by this lite extension.
 *
 * Future ecosystem checkers (XPLANG-11/12) will replace the stub branches.
 */

import type { TrayForkMetadata, TrayUpstreamStatus } from "./types.js";

/**
 * True iff `t` is one of the extended ecosystem types that will eventually
 * have its own upstream checker but currently returns a stub.
 */
export function isStubEcosystem(
  t: TrayForkMetadata["upstreamType"],
): t is "pip" | "cargo" | "go" | "maven" | "gem" | "nuget" {
  return (
    t === "pip" ||
    t === "cargo" ||
    t === "go" ||
    t === "maven" ||
    t === "gem" ||
    t === "nuget"
  );
}

/**
 * Build a stub TrayUpstreamStatus for ecosystems whose checker is not yet
 * implemented. The shape matches a normal status with `latestVersion: null`
 * and a human-readable `_notice` describing the workaround.
 */
export function buildEcosystemStubStatus(
  meta: TrayForkMetadata,
): TrayUpstreamStatus {
  return {
    fork: {
      name: meta.name,
      package: meta.package,
      currentVersion: meta.forkedFromVersion,
      reviewedToVersion: meta.reviewedUpToVersion,
      latestVersion: null,
    },
    versions: [],
    impactAnalysis: {
      affectsModifiedFiles: [],
      affectsUnmodifiedFiles: [],
      newFiles: [],
    },
    _notice:
      `Upstream checking for "${meta.upstreamType}" packages is not yet ` +
      `implemented (XPLANG-11). Use tray_check_upstream with upstreamType ` +
      `"git" and a repo URL as a workaround.`,
  };
}
