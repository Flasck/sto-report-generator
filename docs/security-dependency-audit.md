# Dependency Security Audit

Date: 2026-09-21

## Result

`npm audit` reports zero known vulnerabilities for the committed lockfile. CI runs the same check through
`npm run security:audit` and fails at `low` severity or higher.

## Remediated dependencies

| Package           | Resolved version | Reason                                                                                         |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `adm-zip`         | `0.6.1`          | Fixes uncontrolled ZIP memory allocation and symlink extraction advisories.                    |
| `image-size`      | `2.0.4`          | Fixes infinite-loop advisories for ICNS, JXL and HEIF parsing.                                 |
| `form-data`       | removed          | Upgrading `jsdom` to `30.1.0` removed the vulnerable multipart dependency from the tree.       |
| `js-yaml`         | `3.15.2`         | Keeps `gray-matter` API compatibility while fixing merge-key denial-of-service advisories.     |
| `nanoid`          | `5.1.16`         | Fixes non-secure generator loop and integer-overflow advisories used through `docx`.           |
| `brace-expansion` | `5.0.12`         | Fixes exponential and unbounded expansion denial-of-service advisories in development tooling. |
| `postcss`         | `8.5.28`         | Fixes source-map path traversal in development tooling.                                        |
| `esbuild`         | `0.28.2`         | Fixes the Windows development-server arbitrary file-read advisory.                             |

Direct consumers were regression-tested after updating `adm-zip`, `image-size`, `docx`, `jsdom` and `tsx`.

## Packaging controls

The package remains private and source-only. `package.json` uses an explicit `files` allowlist, and
`npm run check:pack` rejects local runtime, agent, workflow, test, fixture, report or generated artifact paths.
