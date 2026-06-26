/**
 * @fileoverview review — presentChangesForReview, recordDecision, markImplemented.
 * Key exports: presentChangesForReview, recordDecision, markImplemented, completeReview
 * Depends on: metadata
 * Invariants: [1]
 */
/**
 * Pi-Tray review workflow.
 * 
 * Since we can't do interactive prompts in pi commands,
 * the review presents all changes with assessments,
 * and decisions are recorded via /tray decide.
 */

import type {
  TrayForkMetadata,
  TrayUpstreamStatus,
  TrayDecision,
} from "./types.js";
import { loadForkMetadata, saveForkMetadata } from "./metadata.js";

/**
 * Present upstream changes for review.
 * Returns formatted text showing each change with file mapping context.
 */
export function presentChangesForReview(
  fork: TrayForkMetadata,
  upstreamStatus: TrayUpstreamStatus,
): string {
  const lines: string[] = [];
  
  lines.push(`=== Review: ${fork.name} ===`);
  lines.push(`Forked from: ${fork.forkedFromVersion} | Reviewed to: ${fork.reviewedUpToVersion}`);
  lines.push(`Latest upstream: ${upstreamStatus.fork.latestVersion}`);
  lines.push("");
  
  if (upstreamStatus.versions.length === 0) {
    lines.push("No new versions to review.");
    return lines.join("\n");
  }
  
  let changeNum = 0;
  
  for (const ver of upstreamStatus.versions) {
    lines.push(`--- ${ver.version} ${ver.releasedAt ? `(${ver.releasedAt.split("T")[0]})` : ""} ---`);
    
    if (ver.changelog) {
      const clLines = ver.changelog.split("\n").slice(0, 4).map(l => `  ${l.trim()}`);
      lines.push(...clLines);
      lines.push("");
    }
    
    if (ver.changes.length === 0) {
      lines.push("  (No detailed changes available -- version bump only)");
      lines.push("");
      continue;
    }
    
    for (const change of ver.changes) {
      changeNum++;
      const mapping = fork.fileMapping.find(
        f => f.upstream === change.file || f.local === change.file
      );
      
      lines.push(`  [${changeNum}] ${change.changeId}`);
      lines.push(`      File: ${change.file} (${change.changeType})`);
      lines.push(`      ${change.description}`);
      
      if (change.linesAdded || change.linesRemoved) {
        lines.push(`      +${change.linesAdded ?? 0} / -${change.linesRemoved ?? 0} lines`);
      }
      
      // Show our file status
      if (mapping) {
        const statusLabel = mapping.status === "unmodified" 
          ? "UNMODIFIED (clean apply possible)"
          : mapping.status === "patched"
          ? `PATCHED (${mapping.patches?.length ?? 0} patch${(mapping.patches?.length ?? 0) > 1 ? "es" : ""} -- merge may be needed)`
          : mapping.status === "heavily_modified"
          ? "HEAVILY MODIFIED (manual review required)"
          : "DIVERGED (our version is different)";
        
        lines.push(`      Our file: ${mapping.local} [${statusLabel}]`);
      } else if (change.changeType === "added") {
        lines.push(`      Our file: (new -- not yet in our codebase)`);
      }
      
      lines.push("");
    }
  }
  
  lines.push("---");
  lines.push("To record decisions:");
  lines.push("  /tray decide <fork-name> <change-id> <cherry_pick|extract_reimplement|implement_guidance|ignore|defer> <reason>");
  lines.push("");
  lines.push("Example:");
  lines.push(`  /tray decide ${fork.name} ${upstreamStatus.versions[0]?.changes[0]?.changeId ?? "v1.0-fix"} cherry_pick "Clean fix, file is unmodified"`);
  
  return lines.join("\n");
}

/**
 * Record a decision for a specific change.
 */
export function recordDecision(
  forkName: string,
  changeId: string,
  decision: TrayDecision,
  reason: string,
  cwd: string,
): { success: boolean; message: string } {
  const validDecisions: TrayDecision[] = [
    "cherry_pick", "extract_reimplement", "implement_guidance", "ignore", "defer"
  ];
  
  if (!validDecisions.includes(decision)) {
    return {
      success: false,
      message: `Invalid decision "${decision}". Valid: ${validDecisions.join(", ")}`,
    };
  }
  
  const meta = loadForkMetadata(forkName, cwd);
  
  // Parse changeId to extract version: format is "v1.0.0-description" or similar
  // Try to find version prefix
  const versionMatch = changeId.match(/^v?(\d+\.\d+\.\d+)/);
  const upstreamVersion = versionMatch ? versionMatch[1] : "unknown";
  
  // Find or create decision record for this version
  let record = meta.decisions.find(d => d.upstreamVersion === upstreamVersion);
  if (!record) {
    record = {
      upstreamVersion,
      reviewedAt: new Date().toISOString().split("T")[0],
      reviewedBy: "human",
      changes: [],
    };
    meta.decisions.push(record);
  }
  
  // Check if decision already exists for this changeId
  const existing = record.changes.find(c => c.changeId === changeId);
  if (existing) {
    // Update existing decision
    existing.decision = decision;
    existing.reason = reason;
    existing.implemented = false;
  } else {
    // Add new decision
    record.changes.push({
      changeId,
      file: changeId.replace(/^v?\d+\.\d+\.\d+-/, ""),  // Best guess at file
      changeType: "modified",
      description: `Change ${changeId}`,
      decision,
      reason,
    });
  }
  
  saveForkMetadata(forkName, meta, cwd);
  
  return {
    success: true,
    message: `Decision recorded: [${decision.toUpperCase()}] ${changeId} -- ${reason}`,
  };
}

/**
 * Mark a decision as implemented.
 */
export function markImplemented(
  forkName: string,
  changeId: string,
  implementedBy: string,
  cwd: string,
): { success: boolean; message: string } {
  const meta = loadForkMetadata(forkName, cwd);
  
  for (const record of meta.decisions) {
    const change = record.changes.find(c => c.changeId === changeId);
    if (change) {
      change.implemented = true;
      change.implementedAt = new Date().toISOString().split("T")[0];
      change.implementedBy = implementedBy;
      saveForkMetadata(forkName, meta, cwd);
      return {
        success: true,
        message: `Marked ${changeId} as implemented (${implementedBy}).`,
      };
    }
  }
  
  return {
    success: false,
    message: `Change "${changeId}" not found in decision history for ${forkName}.`,
  };
}

/**
 * Update the reviewedUpToVersion after completing a review.
 */
export function completeReview(
  forkName: string,
  version: string,
  cwd: string,
): { success: boolean; message: string } {
  const meta = loadForkMetadata(forkName, cwd);
  meta.reviewedUpToVersion = version;
  meta.reviewedUpToDate = new Date().toISOString().split("T")[0];
  meta.lastChecked = new Date().toISOString().split("T")[0];
  saveForkMetadata(forkName, meta, cwd);
  
  return {
    success: true,
    message: `Review complete. ${forkName} now reviewed up to ${version}.`,
  };
}
