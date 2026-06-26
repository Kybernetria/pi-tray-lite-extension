/**
 * Protocol handlers for pi-tray-lite-extension.
 *
 * Uses lazy dynamic imports for implementation modules so the extension loads
 * without error even when node_modules are not installed.
 */

type ProtocolHandler = (input: unknown) => unknown | Promise<unknown>;

import type { TrayDecision } from "../src/types.js";

export function createHandlers(): Record<string, ProtocolHandler> {
  return {
    tray_create_fork: async (input) => {
      const { createForkFromDecision } = await import("../src/fork-integration.js");
      const params = requireRecord(input, "tray_create_fork input");
      return createForkFromDecision(
        {
          packageName: requireString(params, "packageName"),
          packageVersion: requireString(params, "packageVersion"),
          decision: "fork",
          rationale: {
            primary: requireString(params, "reason"),
            concerns: optionalStringArray(params, "concerns") ?? [],
            benefits: optionalStringArray(params, "benefits"),
          },
          decisionDate: new Date().toISOString(),
          forkPath: requireString(params, "forkPath"),
          autoApproved: false,
        },
        repoRoot(params),
        { forkNamespace: optionalString(params, "forkNamespace") },
      );
    },

    tray_check_upstream: async (input) => {
      const { loadForkMetadata } = await import("../src/metadata.js");
      const { checkNpmUpstream } = await import("../src/upstream-npm.js");
      const { buildEcosystemStubStatus, isStubEcosystem } = await import("../src/upstream-dispatch.js");
      const params = requireRecord(input, "tray_check_upstream input");
      const meta = loadForkMetadata(requireString(params, "forkName"), repoRoot(params));
      if (meta.upstreamType === "npm") return checkNpmUpstream(meta);
      if (isStubEcosystem(meta.upstreamType)) return buildEcosystemStubStatus(meta);
      return { ok: false, message: `Upstream type '${meta.upstreamType}' is not supported for automatic checks.` };
    },

    tray_get_fork_status: async (input) => {
      const { loadForkMetadata, listForks, getForkStatus } = await import("../src/metadata.js");
      const params = optionalRecord(input);
      const cwd = repoRoot(params);
      const forkName = optionalString(params, "forkName");
      if (forkName) return getForkStatus(loadForkMetadata(forkName, cwd));
      return { forks: listForks(cwd).map((name) => getForkStatus(loadForkMetadata(name, cwd))) };
    },

    tray_record_decision: async (input) => {
      const { recordDecision } = await import("../src/review.js");
      const params = requireRecord(input, "tray_record_decision input");
      return recordDecision(
        requireString(params, "forkName"),
        requireString(params, "changeId"),
        requireDecision(params),
        requireString(params, "reason"),
        repoRoot(params),
      );
    },

    tray_apply_change: async (input) => {
      const { handleTrayApply } = await import("../src/apply.js");
      const params = requireRecord(input, "tray_apply_change input");
      const message = await handleTrayApply(
        requireString(params, "forkName"),
        requireString(params, "changeId"),
        repoRoot(params),
        {
          dryRun: optionalBoolean(params, "dryRun") ?? true,
          markImplemented: optionalBoolean(params, "markImplemented"),
        },
      );
      return { message };
    },

    tray_health_check: async (input) => {
      const { runHealthCheck } = await import("../src/health-check.js");
      const params = optionalRecord(input);
      return runHealthCheck(repoRoot(params));
    },
  };
}

export default createHandlers;

function repoRoot(params: Record<string, unknown>): string {
  return optionalString(params, "repoRoot") ?? process.cwd();
}

function optionalRecord(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  return requireRecord(value, "input");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string when provided.`);
  return value;
}

function optionalBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean when provided.`);
  return value;
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${key} must be an array of strings when provided.`);
  return value;
}

function requireDecision(params: Record<string, unknown>): TrayDecision {
  const value = requireString(params, "decision");
  if (!["cherry_pick", "extract_reimplement", "implement_guidance", "ignore", "defer"].includes(value)) {
    throw new Error("decision must be one of: cherry_pick, extract_reimplement, implement_guidance, ignore, defer.");
  }
  return value as TrayDecision;
}
