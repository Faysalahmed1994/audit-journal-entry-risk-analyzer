# AuditJE — Journal Entry Testing Web App

**Status: public preview v0.2 — not validated for audit production use.**

**Open the app:** https://faysalahmed1994.github.io/audit-journal-entry-risk-analyzer/ *(live once GitHub Pages is enabled — [one-time setup](docs/GO_LIVE.md))*

AuditJE takes an auditor through journal entry testing from start to finish, in the order the work is actually done:

| Step | What happens |
|---|---|
| **JE.0 Engagement** | Choose an engagement folder on your computer; enter client, period, team and an optional key-item threshold. |
| **JE.1 Population** | Import the JE listing (CSV/XLSX). Columns are auto-matched and editable. A copy is saved to `01_Population/` with its SHA-256 hash. |
| **JE.2 Completeness** | Agree line/entry/debit/credit totals to independent reports, roll the trial balance forward account by account, check period coverage and find gaps in journal numbers. |
| **JE.3 Risk analysis** | Score every entry against 19 fraud-risk characteristics drawn from AU-C 240 / AS 2401 (post-closing, self-approved, seldom-used accounts, infrequent preparers, duplicate entries, vague descriptions, weekend/after-hours, round amounts and more), plus a Benford first-digit test. Weights and thresholds are adjustable. |
| **JE.4 Sample selection** | Key items above your threshold, then the highest-risk entries, then a seeded random selection. Every manual addition or removal requires a reason and is logged. |
| **JE.5 Vouching** | Attach vouchers (PDF, images, Word, Excel, email) to each selected entry. Files are saved to `03_Vouchers/<JE>/` and referenced V-001, V-002…; record six test attributes, voucher amounts (auto-compared to the entry), conclusions and exceptions. |
| **JE.6 Workpaper** | Record the conclusion and sign-offs, then generate an Excel workpaper in `02_Workpapers/` with cover, completeness, TB roll-forward, sample and vouching results, a voucher index **hyperlinked to each voucher file**, risk register, change log, data quality, full population and methodology. |

Progress autosaves to `engagement.json` in the folder — reopen the folder later and continue where you left off.

```text
<engagement folder>/
  01_Population/   JE listing and TB exactly as imported
  02_Workpapers/   generated Excel workpapers
  03_Vouchers/     vouchers, one subfolder per journal entry
  engagement.json  saved progress (settings, sample, vouching results)
```

## Confidentiality by design

AuditJE is a static web page. **All parsing, scoring and workbook generation run inside your browser; client files are never uploaded.** The page's Content Security Policy blocks network connections to anywhere except the app's own files, and the automated test suite fails if the app makes any outside request. Fonts and the Excel library are bundled locally. After the first visit the app also works offline.

Even so, follow your firm's policies before using it with client data, and keep engagement folders in your firm's approved, access-controlled locations.

## Browser support

| Browser | Works? |
|---|---|
| Chrome or Edge (desktop) | ✅ Full experience, including saving to an engagement folder |
| Firefox, Safari, mobile | ⚠️ Works in the tab only: files stay in memory and you download the workpaper at the end |

## Try it

Open the app and choose **Try the sample engagement**. It loads a fully synthetic municipal general ledger (411 entries) and trial balance with planted anomalies (a self-approved reclass "per CFO", a post-closing accrual, a duplicate invoice, a $500 TB difference, missing journal numbers, and so on).

## Important audit limitations

- Import checks do **not** by themselves prove population completeness; obtain the extract yourself, evaluate report parameters, and reconcile to the GL/TB.
- A risk score is a transparent heuristic, **not** a fraud determination. Review false positives and consider risks the rules cannot see.
- Risk-based and random selections are **not a statistical sample** and must not be used to project misstatement.
- Voucher amounts and attributes are entered by the auditor; AuditJE does not read documents automatically.
- One entity, one currency and one period per import. Tested to roughly 1 million lines in the browser; very large ledgers depend on your computer's memory.

## Develop and test

No build step: the app is plain HTML, CSS and JavaScript modules in [`docs/`](docs/).

```bash
npm install            # test tooling only (Playwright, ExcelJS)
npm test               # engine unit tests
npx playwright install chromium && npm run test:e2e   # full browser workflow test
npm run serve          # http://localhost:8000
```

| Path | Purpose |
|---|---|
| `docs/index.html`, `docs/assets/app.css` | App shell and styling |
| `docs/assets/js/engine.js` | Parsing, completeness, risk rules, sampling (pure functions) |
| `docs/assets/js/io.js` | CSV/XLSX reading, SHA-256 |
| `docs/assets/js/store.js` | Engagement folder storage (File System Access API) |
| `docs/assets/js/workpaper.js` | Excel workpaper generation |
| `docs/assets/js/app.js` | User interface |
| `docs/assets/sample/` | Synthetic demo data (`npm run sample` regenerates it) |
| `tests/` | Unit and end-to-end tests |
| `app.py`, `je_core.py`, `report.py` | Original v0.1 offline Python edition (still supported; see below) |

Documentation: [methodology](docs/METHODOLOGY.md) · [data dictionary](docs/DATA_DICTIONARY.md) · [roadmap](docs/ROADMAP.md) · [reviewer guide](docs/PUBLIC_REVIEW.md).

### Offline Python edition (v0.1)

The original local Python tool remains available: install Python 3.11+, run `setup_windows.bat` once, then `run_windows.bat` (or `python3 app.py`). It serves only on `127.0.0.1` and now rejects requests from other hosts or origins. Python tests: `python -m unittest discover -s tests -v`.

## Public review

[Join the open review thread (#1)](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/issues/1) · [Report a bug or request a feature](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/issues/new/choose) · [Contribute or fork](CONTRIBUTING.md). Please use **synthetic data only** in issues.

## Intended relevance

The broader aim is to provide reusable, explainable audit analytics that may reduce repetitive audit preparation for small and mid-sized firms, government entities and nonprofit audits. Meaningful claims about time saved, detection quality, independent users and impact require real validation. This project may support the author's wider public-interest audit modernization endeavor; it is **not** evidence of approved NIW status or a legal outcome.

**License:** [MIT](LICENSE). Bundled: [ExcelJS](https://github.com/exceljs/exceljs) (MIT), [Public Sans](https://github.com/uswds/public-sans) (OFL 1.1). Forks and pull requests are welcome; public comments and forks do not imply professional validation, endorsement or adoption.
