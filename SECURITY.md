# Security and privacy policy

AuditJE is an early prototype, **not validated or approved for production audits**.

## Scope and supported versions

Only the latest version on `main` is maintained as a public preview. There is no service-level agreement, vulnerability bounty, or warranty.

## Sensitive findings

Please **do not publish sensitive exploit details or affected client information in public GitHub issues**. To disclose a security concern, use **Security → Advisories → Report a vulnerability** in this repository *if the repository owner has enabled private vulnerability reporting*. If that option is not enabled, open a public issue containing only a non-sensitive request for a private reporting channel, with no exploit steps or confidential data.

## Handling audit records

- The GitHub Pages web app processes files only inside the user's browser; its Content Security Policy blocks connections to other origins, and it ships with synthetic sample data only. Files are saved only to a folder the user selects.
- The separately downloaded application is designed to listen on loopback (`127.0.0.1`), but use it only with appropriate authorization and local IT/security controls.
- Do not commit, post, or attach any client records or workpapers to public GitHub.
- All analysis outcomes require professional judgment, independent population validation, and appropriate audit review.

## Dependencies and testing

Report dependency vulnerabilities when found; add reproducible synthetic tests. No claim of a completed penetration test or external security audit is made.
