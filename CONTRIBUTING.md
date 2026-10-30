# Contributing to AuditJE

Thank you for contributing to AuditJE, a public-preview journal-entry testing project intended to make audit workflows easier to review, reproduce, and improve.

## Quick start

1. Review the [README](README.md), [methodology](docs/METHODOLOGY.md), [data dictionary](docs/DATA_DICTIONARY.md), and [public reviewer guide](docs/PUBLIC_REVIEW.md).
2. Try the [web app](https://faysalahmed1994.github.io/audit-journal-entry-risk-analyzer/) with the synthetic sample engagement, or run it locally with `npm run serve`.
3. [Open an issue](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/issues/new/choose) before a substantial change so the scope can be discussed.
4. Fork the repository, create a named branch, commit your changes, and open a pull request against `main`.
5. For web app changes run `npm test` and `npm run test:e2e`; for Python changes run `python -m unittest discover -s tests -v`. Add synthetic regression tests for bug fixes.
6. Describe what changed, the audit impact, and limitations; include screenshots using **synthetic data only**.

## Scope

Especially welcome: parser correctness, source-to-population reconciliation controls, reproducible sampling, methodology transparency, local security, Excel workpaper usability, accessibility, and reviewer documentation.

Please keep changes narrowly scoped. The web app must keep processing local to the browser: do not add analytics, remote fonts, CDNs or any network calls (the end-to-end test fails on outside requests). Do not describe AuditJE outputs as verified audit conclusions.

## Security and client confidentiality

- **Never** put real general ledgers, voucher images, client identifiers, credentials, or confidential material in issues, pull requests, demo assets, or test fixtures.
- Use fully synthetic examples, with artificial account numbers and descriptions.
- Do not present a scoring flag as a finding of fraud, misstatement, or statutory noncompliance.
- For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) rather than publishing exploit details immediately.

## License

The repository is available under the [MIT License](LICENSE). By contributing, you agree that your contribution will be distributed under that license. Please submit code you have the right to share.

Feedback and pull requests are welcome; reviewing a PR does not imply professional audit certification or formal external adoption.
