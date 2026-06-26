# Tests

This lite extraction currently validates with `npm run typecheck`.

Suggested next tests:
- metadata migration/load/save round trip
- `tray_health_check` rejects path traversal in file mappings
- `tray_record_decision` persists valid decisions and rejects invalid ones
- `tray_apply_change` dry-run refuses patched/heavily modified mappings
