# Import data dictionary

The prototype reads the **active (first-selected) worksheet** from `.xlsx` or a UTF-8/Windows-1252 `.csv`. The first row must contain headers. Some frequently encountered alternative header names are supported.

| Field | Required | Example | Interpretation |
|---|---|---|---|
| `journal_id` | Yes | `JE-1042` | Groups GL lines into one journal entry; ID should be unique within the uploaded population |
| `posting_date` | Yes | `2026-12-31` | Date of posting, accepted ISO or US date formats |
| `account` | Yes | `10100` | GL account name or account number |
| `debit` | Yes | `1250.00` | Nonnegative debit amount; use zero for credits |
| `credit` | Yes | `0.00` | Nonnegative credit amount; use zero for debits |
| `line_id` | Optional | `001` | Identifier unique *within each journal* |
| `description` | Optional | `Accrual adjustment` | GL line narration |
| `preparer` | Optional | `Clerk01` | User who entered/prepared the JE |
| `entry_time` | Optional | `21:30` | Local time HH:MM or hh:mm AM/PM |
| `source` | Optional | `Manual` | Manual, system, etc. |
| `approval_status` | Optional | `Approved` | Status as documented by originating system |

**Assumptions:** one currency, one entity, one reporting period per upload, and individual debit/credit columns (not one signed net amount). Accrued balances, beginning balances, and summarizing header rows should be removed from the input. Preserve the raw GL export separately.

**Excel formula cells:** only cached results are used when reading `.xlsx`; recalculate and save the workbook before importing if it contains formulas.

**Evidence:** you can add screenshots through the UI to *selected* JEs. Currently there is no document OCR, voucher extraction, or automated cross-vouching to invoices.
