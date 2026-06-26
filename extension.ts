/**
 * pi-tray-lite-extension — protocol-only entry point.
 *
 * Registers the pi_tray_lite node on the protocol fabric so callers can
 * invoke provides (tray_create_fork, tray_check_upstream,
 * tray_get_fork_status, tray_record_decision, tray_apply_change,
 * tray_health_check) through the shared protocol gateway instead of
 * individual Pi tools.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import manifestJson from "./pi.protocol.json" with { type: "json" };
import { createHandlers } from "./protocol/handlers.js";

export default function piTrayLiteExtension(pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();
  fabric.unregister("pi_tray_lite");
  registerProtocolManifest(fabric, {
    manifest: manifestJson as unknown as PiProtocolManifest,
    handlers: createHandlers(),
  });
}
