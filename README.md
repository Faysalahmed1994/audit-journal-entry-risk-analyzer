# AuditJE — Offline Journal Entry Risk & Workpaper Analyzer

**Status: functional local prototype v0.1 — not validated for audit production.**

AuditJE is a laptop-hosted, explainable, rules-based tool for financial audit teams to review journal-entry populations, triage unusual postings, select a reproducible risk-based sample, and create an Excel audit workpaper with manually attached voucher screenshots.

> **Confidentiality:** files are processed at `127.0.0.1` on your own laptop. There is no cloud upload, subscription or paid API. Do **not** commit client data or workpapers. Follow employer policies and audit standards before use.

## Included functionality

| Capability | Available now? |
|---|---|
| Import GL journal lines via CSV or XLSX | ✅ |
| Test missing identifiers/dates/accounts, duplicates and unbalanced JEs | ✅ |
| Compare population counts and monetary totals to user-supplied independent controls | ✅ |
| Score JE-level weekend, after-hours, high-value, manual and other indicators | ✅ |
| Risk-first + reproducible random JE sampling (seed recorded) | ✅ |
| Export Excel workpaper with risk register, selected samples, data quality and methods | ✅ |
| Manually attach PNG/JPG voucher screenshots to exported workbook | ✅ |
| Auto-OCR PDFs, auto-vouch against client vouchers, automatic approval decisions | ❌ planned |
| Windows one-click installed `.exe` | ❌ planned |

## Run locally (Windows)

1. Install **Python 3.11 or later** (from python.org), checking **Add Python to PATH**.
2. Download and unzip this project into a directory on your laptop.
3. With an internet connection **once**, double-click `setup_windows.bat` to install `openpyxl` and `Pillow` into Python. (A virtual environment is preferable in managed IT setups.)
4. Double-click `run_windows.bat` to start the tool. Your browser opens `http://127.0.0.1:8765/`.
5. Import your authorized `.xlsx` or `.csv`, set sample size / risk %, optional independent control totals, and click **Analyze JEs**.
6. Inspect the register and sample. Optionally attach your own PNG/JPG voucher screenshots, then click **Download audit workpaper**.
7. Press **Ctrl+C** in the terminal to close. After step 3, **internet is not required**.

Mac/Linux: `python3 -m pip install -r requirements.txt` (first time), then `python3 app.py`.

To trial without data, click **Use sample data** in the interface. That sample is fully synthetic.

## Source format

Required column headers: `journal_id`, `posting_date`, `account`, `debit`, `credit`. Common alternative names are supported. Optional columns: `line_id`, `description`, `preparer`, `entry_time`, `source`, `approval_status`. See [data dictionary](docs/DATA_DICTIONARY.md), [methodology](docs/METHODOLOGY.md), and [synthetic example](examples/synthetic_journal_entries.csv).

## Important audit limitations

- Import checks and totals do **not** by themselves prove population completeness; an auditor must independently reconcile the JE extract to source system, GL/TB, and assess filters and unposted entries.
- A high risk score does **not** mean fraud or misstatement. Rules are intentionally transparent and heuristic; independent review/validation is necessary.
- The reproducible selection is a mix of targeted and simple random selection, **not** a statistical sample suitable for projecting error rates.
- This version does not automatically read or validate voucher screenshots and does not replace a qualified auditor's testing and review.
- File limit: 20 MB; prototype parser may not be suitable for very large GLs. One entity / single reporting period per import.

## Project layout

```text
app.py                         Local-only server and API
index.html                     Browser UI (offline)
je_core.py                     Import / screening / sample selection
report.py                      XLSX workpaper generator
examples/                      Synthetic demonstration GL
run_windows.bat                Windows launcher
setup_windows.bat              One-time dependencies
requirements.txt               Third-party packages
docs/DATA_DICTIONARY.md        Mapping assumptions
docs/METHODOLOGY.md            Rule weights and audit limitations
docs/ROADMAP.md                Product development phases
docs/NIW_EVIDENCE_PLAN.md      Ethical impact measurement plan
tests/                         Unit tests
.github/workflows/tests.yml    Synthetic-data CI
```

## Test

```bash
python -m unittest discover -s tests -v
```

## Intended relevance

The broader aim is to provide reusable, explainable audit analytics that may reduce repetitive audit preparation for small and mid-sized firms, government entities and nonprofit audits. Meaningful claims about time saved, detection quality, independent users and impact require real validation. This project may support the author's wider public-interest audit modernization endeavor; it is **not** evidence of approved NIW status or a legal outcome.

**License:** Copyright is reserved unless the owner later selects and adds an open-source license. Public visibility does not itself grant permission to reuse code.