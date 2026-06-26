# pi-tray-lite-extension

A small Pi extension and pi-protocol node for managing local forks of upstream packages/extensions.
It stores fork state in `.pi/forks/<fork-name>/.pi-fork-meta.json` and is safe-by-default for applying upstream changes.

## Pi protocol

This package ships `pi.protocol.json` with node id `pi_tray_lite` and registers it from `extension.ts` via `@kyvernitria/pi-protocol-minimal`.
The handler exports are available at `./protocol/handlers` (`createHandlers`). Existing Pi tool registration remains in place for local Pi UI usage.

Protocol callers may pass an optional `repoRoot` to each provide; otherwise handlers use `process.cwd()`.

## Tools / provides

- `tray_create_fork` — create a managed fork from an npm package version.
- `tray_check_upstream` — check npm for newer upstream versions.
- `tray_get_fork_status` — list fork metadata and pending decisions.
- `tray_record_decision` — record `cherry_pick`, `extract_reimplement`, `implement_guidance`, `ignore`, or `defer`.
- `tray_apply_change` — conservatively apply a `cherry_pick`; dry-run is the default, and it never runs git commits or test/typecheck commands.
- `tray_health_check` — validate fork metadata and local paths.

## Fork lifecycle

1. **Create fork**: run `tray_create_fork` with package name, version, fork path, and a clear reason. It downloads the npm tarball and creates initial file mappings.
2. **Check upstream**: run `tray_check_upstream` to discover versions newer than `reviewedUpToVersion`.
3. **Review changes**: inspect returned versions/changelogs and local file mappings.
4. **Record decision**: run `tray_record_decision` for each change.
5. **Apply or ignore**: run `tray_apply_change` for cherry-picks (prefer `dryRun: true` first), or leave ignored/deferred changes recorded in metadata.

## Storage layout

```text
.pi/forks/
  <fork-name>/
    .pi-fork-meta.json
    README.md
    upstream-snapshot/
    local/
```

Every fork metadata record includes `forkReason`, forked/reviewed versions, file mappings, decision history, and additions. File mappings initially point from files in the unpacked npm package to `.pi/forks/<fork-name>/local/...`.

## Notes

This lite extraction intentionally excludes wrapper, recommendation, security, package-intake, local-registry, workspace-health, and bakery orchestration integrations. `tray_apply_change` does not run git commits, test commands, or typecheck commands.
