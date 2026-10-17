# Security policy

Flottenmanifest is a static page: it has no server, no accounts and stores everything in the visitor's browser.
Security problems can still matter (for example code injection through an imported file), so reports are welcome.

## Reporting a vulnerability

Please report privately via **GitHub → Security → "Report a vulnerability"** in this repository
(private vulnerability reporting). Do not open a public issue with details.

Helpful to include:

- what an attacker could do and how (steps or a sample file),
- browser and version,
- whether it affects the source version (`index.html`), the standalone file (`dist/flottenmanifest.html`) or both.

You will get an answer as soon as possible; fixes are released as a new version and mentioned in `flottenmanifest/CHANGELOG.md`.

## Supported versions

Only the latest release is supported.

## Scope

In scope: the page itself (import, editor, stored data, rendering), the build tools in `flottenmanifest/tools/`.
Out of scope: robertsspaceindustries.com and other external sites the page links to.
