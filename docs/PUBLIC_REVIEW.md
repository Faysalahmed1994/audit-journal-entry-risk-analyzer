# AuditJE v0.1 — Public Preview and Reviewer Guide

**Project status:** Early-stage, rules-based journal-entry risk analysis and workpaper prototype. **Not production-validated, not a fraud detector, not an AI model, and not a substitute for professional judgment.**

Thank you for reviewing AuditJE. The goal of this preview is to learn what auditors, accounting professionals, government/nonprofit finance staff, audit technology developers, and researchers find useful, unclear, or missing before the next release.

## What you can try

1. Download the repository (Code > Download ZIP) and follow the setup steps in [README](../README.md).
2. Start the tool locally and select **Use sample data**. The sample is fully synthetic.
3. Examine the risk register, data-quality checks, and selection logic. Adjust the sample size and risk-based portion.
4. Download the Excel workpaper. Evaluate whether an audit team could document procedures, results, and evidence clearly.
5. Report a bug or suggest an enhancement using the [GitHub Issues page](../issues) or the [feedback template](../.github/ISSUE_TEMPLATE/auditje_feedback.md).

If you are unable to install Python, you can still review the [methodology](METHODOLOGY.md), [data dictionary](DATA_DICTIONARY.md), [roadmap](ROADMAP.md), and code.

## What feedback would be most useful?

- **Audit methodology:** Is each risk flag appropriately explained? What false-positive or false-negative patterns could occur?
- **Population completeness:** Which independent checks and source-system export controls should be prioritized?
- **Sampling:** Are seeded reproducible selections, exception handling, and audit-trail details adequate? What alternative methods would be useful?
- **Workpaper usability:** Which columns, sign-offs, review notes, and voucher-reference fields are missing?
- **Government/nonprofit relevance:** What system exports or common entry patterns need support?
- **Product reliability/security:** What data parsing, local storage, input validation, or edge cases need attention?
- **Accessibility and onboarding:** What would help someone unfamiliar with Python test this tool?

## How to submit feedback

Open a [new GitHub Issue](../issues/new/choose), select the **AuditJE Public Feedback** template when available, and describe your observations. When reporting a bug, include steps to reproduce, expected behavior, actual behavior, software version, and a *synthetic* sample showing the problem. You can also add a comment to the public review invitation issue in this repository.

**Never upload real client GLs, voucher screenshots, personal identifying information, proprietary audit files, credentials, or confidential workpapers.** Feedback examples must be synthetic or expressly authorized for public release. The application is designed for local use, but your employer and client data-handling policies continue to apply.

## Validation and claims

- Risk indicators flag entries **for further review**; they do not establish misstatements or fraud.
- The app's import totals do not independently establish population completeness.
- The current blended targeted/random selection is **not** a statistical sample for projection.
- No demonstrated time savings, external adoption, effectiveness metrics, or independence of review should be claimed unless documented by actual evidence.
- Feedback may inform future development. Submitting feedback does **not** imply endorsement, official adoption, or an audit opinion.

## Reviewer-friendly testing notes

For each suggested improvement, indicate whether it is a **critical audit/control gap**, **bug**, **usability change**, or **future feature**. If you can, propose an objective acceptance criterion. For time-savings testing, compare equivalent tasks against an existing manual workflow, record the method and sample size, and avoid claims based on unverified estimates.

Thank you for providing constructive, independent feedback.
