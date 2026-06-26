/**
 * pi-tray-lite-extension — protocol-only entry point.
 *
 * Registers the pi_tray_lite node on the protocol fabric so callers can
 * invoke provides through the shared protocol gateway.
 *
 * Bootstraps @kyvernitria/pi-protocol-minimal if not already available,
 * installing it into ~/.pi/agent/node_modules/ so ALL future extensions
 * find it without duplication.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHandlers } from "./protocol/handlers.js";

const _require = createRequire(import.meta.url);

function ensureProtocolMinimal(): void {
  try {
    _require.resolve("@kyvernitria/pi-protocol-minimal");
  } catch {
    const targetDir = join(homedir(), ".pi", "agent", "node_modules", "@kyvernitria");
    const source = join(homedir(), "Applications", "pi", "pi-protocol", "packages", "pi-protocol-minimal");
    if (existsSync(source)) {
      mkdirSync(targetDir, { recursive: true });
      symlinkSync(source, join(targetDir, "pi-protocol-minimal"), "dir");
    } else {
      const { execSync } = _require("node:child_process");
      mkdirSync(targetDir, { recursive: true });
      execSync("npm install @kyvernitria/pi-protocol-minimal", { cwd: join(homedir(), ".pi", "agent"), stdio: "pipe" });
    }
  }
}

export default function piTrayLiteExtension(pi: ExtensionAPI): void {
  ensureProtocolMinimal();

  const { ensureProtocolFabric, registerProtocolManifest } = _require("@kyvernitria/pi-protocol-minimal");
  const manifest = JSON.parse(readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"));

  const fabric = ensureProtocolFabric();
  fabric.unregister("pi_tray_lite");
  registerProtocolManifest(fabric, {
    manifest,
    handlers: createHandlers(),
  });
}
