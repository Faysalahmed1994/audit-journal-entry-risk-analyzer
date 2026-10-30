# Import data dictionary

AuditJE reads `.csv` (UTF-8 or Windows-1252; comma, semicolon, tab or pipe delimited) and `.xlsx` files. The header row is detected automatically and you can choose the worksheet. Columns are matched by name and every match can be changed on the mapping screen, so your file does not need these exact headers.

## Journal entry population

| Field | Required | Example | Notes |
|---|---|---|---|
| Journal ID | Yes | `JE-1042` | Groups lines into one entry. Blank IDs are reported and treated as separate entries. |
| Posting date | Yes | `2026-06-30`, `6/30/2026 0:00`, `30-Jun-2026` | ISO, US (or day-first if selected), month-name and Excel date formats; a time component is ignored. |
| GL account | Yes | `5310 Contractual Services` | Account number and/or name. The leading code is used to match the trial balance. |
| Debit and Credit | Yes* | `1250.00` / `0` | Accepts `$`, thousands separators, `(500.00)`, `500-` and `500 CR`. |
| Signed amount | Yes* | `-1250.00` | *Alternative to Debit/Credit: positive = debit, negative = credit. |
| Line ID | No | `001` | Duplicate line IDs within an entry are reported. |
| Effective / document date | No | `2026-06-30` | Enables the backdating test (effective date well before posting date). |
| Account name | No | `Contractual Services` | Shown in the workpaper. |
| Description | No | `Accrue June services` | Used by the vague-description and duplicate tests. |
| Prepared / entered by | No | `mjohnson` | Enables missing-preparer, infrequent-preparer and self-approval tests. |
| Approved by | No | `controller` | Enables the self-approval test. |
| Entry time | No | `21:42`, `9:42 PM`, `2026-06-27 21:42:00` | Enables the after-hours test; Excel time cells are supported. |
| Source / entry type | No | `Manual`, `AP`, `Payroll` | Values listed in the rules panel (e.g., Manual, Spreadsheet, Topside) flag manual entries. |
| Approval status | No | `Approved`, `Pending` | Pending, rejected, unapproved, draft or open are flagged. |

## Trial balance (optional, for the roll-forward)

| Field | Required | Notes |
|---|---|---|
| GL account | Yes | Matched to the population by exact text, then by leading account code. |
| Beginning balance | Yes | Debit positive, credit negative. |
| Ending balance | Yes | Debit positive, credit negative. |
| Account name | No | |

## Assumptions

- One entity, one currency and one reporting period per import.
- Remove subtotal or header rows that are not journal lines.
- Formulas in `.xlsx` files are read from their last calculated values; recalculate and save in Excel first.
- Legacy `.xls` files must be re-saved as `.xlsx` or `.csv`.
- Keep the original system export; AuditJE saves an unchanged copy and its SHA-256 hash in `01_Population/`.
