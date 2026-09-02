# Dependency Security Audit

Date: 2026-09-02

Scope: production dependency audit for the source-only private npm artifact. This record uses the current `npm audit --omit=dev --json` output and does not claim remediation because this task intentionally does not modify lockfiles.

## Current Advisories

| Package      | Direct | Advisory                                                      | Severity | Current reachability                                                                                                                                    | Mitigation / follow-up                                                                                                                                                                                 |
| ------------ | ------ | ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adm-zip`    | yes    | GHSA-xcpc-8h2w-3j85                                           | high     | Used by `src/shared/lib/docx-archive.ts` to unpack and inspect DOCX ZIP packages supplied by local report workflows and tests.                          | Treat DOCX inputs as trusted/local until upgraded. Follow up by testing `adm-zip@0.6.0` because npm marks the available fix as a semver-major update.                                                  |
| `image-size` | yes    | GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq                      | high     | Used by `src/features/markdown-parser/lib/parser/handlers/image-handler.ts` to read dimensions from local report image buffers.                         | Keep image inputs local/trusted and avoid unreviewed ICNS, JXL, and HEIF files. No npm audit fix is currently available for installed `image-size@2.0.2`; track upstream replacement or fixed release. |
| `form-data`  | no     | GHSA-hmw2-7cc7-3qxx                                           | high     | Transitive dependency through `jsdom@23.2.0`; this codebase uses `JSDOM` for XML/MathML conversion and does not build multipart HTTP requests directly. | Upgrade the dependency chain when lockfile updates are allowed and re-run `npm audit --omit=dev`.                                                                                                      |
| `js-yaml`    | no     | GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj | high     | Transitive dependency through `gray-matter@4.0.3`, which parses report frontmatter from local Markdown modules.                                         | Keep report sources local/trusted. Follow up by moving the frontmatter parser chain to a fixed `js-yaml` version or replacement when lockfile changes are permitted.                                   |
| `nanoid`     | no     | GHSA-28wg-ghj8-5hjv, GHSA-xwg4-73v4-xw9w                      | high     | Transitive dependency through `docx@9.6.1`; the project does not call `nanoid` directly.                                                                | Upgrade `docx` or override the transitive dependency only in a dedicated dependency update with lockfile review and generated DOCX regression tests.                                                   |

## Packaging Controls

The package is marked `private` and source-only. `package.json` now uses an explicit `files` allowlist, and `npm run check:pack` fails if release tarball contents include local runtime, agent, workflow, test, fixture, report, or generated artifact paths.

## Explicit Non-Claims

- `npm audit --omit=dev` is not clean.
- No advisory is marked fixed by this task.
- Lockfile and dependency upgrades remain follow-up work.
