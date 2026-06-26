/**
 * pi-tray-lite-extension — protocol-only entry point.
 *
 * Registers the pi_tray_lite node on the protocol fabric so callers can
 * invoke provides (tray_create_fork, tray_check_upstream,
 * tray_get_fork_status, tray_record_decision, tray_apply_change,
 * tray_health_check) through the shared protocol gateway instead of
 * individual Pi tools.
 *
 * @kyvernitria/pi-protocol-minimal is an optional peer dep — if unavailable
 * the extension loads silently without protocol registration.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHandlers } from "./protocol/handlers.js";

const _require = createRequire(import.meta.url);

export default function piTrayLiteExtension(pi: ExtensionAPI): void {
  registerProtocolIfAvailable();
}

function registerProtocolIfAvailable(): void {
  let protocolMinimal: typeof import("@kyvernitria/pi-protocol-minimal");
  try {
    protocolMinimal = _require("@kyvernitria/pi-protocol-minimal");
  } catch {
    // @kyvernitria/pi-protocol-minimal not installed — skip protocol registration.
    return;
  }

  const manifest = JSON.parse(
    readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"),
  );

  const fabric = protocolMinimal.ensureProtocolFabric();
  fabric.unregister("pi_tray_lite");
  protocolMinimal.registerProtocolManifest(fabric, {
    manifest,
    handlers: createHandlers(),
  });
}
