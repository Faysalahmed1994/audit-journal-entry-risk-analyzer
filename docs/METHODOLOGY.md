# Journal entry testing methodology (v0.2)

## Intended use

AuditJE supports the auditor's response to the risk of management override of controls (AU-C 240 / PCAOB AS 2401; ISA 240 for international engagements): testing the appropriateness of journal entries recorded in the general ledger. It is a **rules-based planning and documentation aid**. A flagged entry is not necessarily fraudulent, improper or material, and the tool does not replace walkthroughs, inquiry, professional skepticism or review.

## 1. Population and completeness (JE.2)

| Procedure | How AuditJE performs it |
|---|---|
| Population integrity | The imported file is stored unchanged with a SHA-256 hash; reopening the engagement warns if the file has changed. |
| Debits equal credits | Total population debits are compared with total credits (tolerance $0.01). |
| Independent control totals | Line count, entry count, total debits and total credits agree to values the auditor enters from an independent system report. |
| Trial balance roll-forward | For every TB account: beginning balance + in-period JE activity − ending balance = 0. GL accounts missing from the TB are listed. |
| Period coverage | Entries dated before or after the period are counted; months with no activity are listed. |
| Journal number sequence | Numeric suffixes are checked by prefix for gaps; each missing range needs an explanation (voided, deleted, other ledger). |

Import checks alone do not prove completeness: obtain the extract yourself, document report parameters and posting status, and consider entries recorded outside the GL (e.g., consolidation or top-side adjustments).

## 2. Risk characteristics (JE.3)

Scoring is at the journal entry level. Each characteristic adds its weight; scores are capped at 100. Default tiers: **High ≥ 50, Medium 20–49, Low < 20**. All weights, on/off switches and thresholds can be changed, and the settings in force are recorded in the workpaper.

| Characteristic | Default weight | Rule |
|---|---:|---|
| Unbalanced entry | 35 | Debits ≠ credits by more than $0.01 |
| Posted after period end | 25 | Posting date after the period end (post-closing) |
| Above auditor threshold | 25 | Amount ≥ the threshold set (e.g., performance materiality) |
| Large value | 20 | Amount ≥ the 90th percentile of entries (≥ 10 entries) |
| Backdated entry | 20 | Effective/document date more than 30 days before posting |
| Not approved | 20 | Status pending, rejected, unapproved, draft or open |
| Self-approved | 20 | Approver is the preparer |
| Duplicate line | 20 | A line exactly repeats another line in the same entry |
| Possible duplicate entry | 20 | Another entry with a different ID has identical accounts and amounts |
| Weekend posting | 15 | Posted on Saturday or Sunday |
| After-hours entry | 15 | Entered before 07:00 or at/after 19:00 |
| Manual source | 15 | Source is Manual, Spreadsheet, Excel, Topside, GJ, etc. |
| Near period end | 15 | Posted in the last 5 days of the period |
| Dated before period | 15 | Posting date before the period start |
| Seldom-used account | 15 | Uses an account appearing in ≤ 2 entries (populations ≥ 30 entries) |
| Infrequent preparer | 15 | Prepared by a user with ≤ 2 entries (populations ≥ 30 entries) |
| Round amount | 10 | Amount ≥ $1,000 and an exact multiple of $1,000 |
| Missing preparer | 10 | No preparer on any line |
| Vague/no description | 10 | Blank or very short, or contains adj, plug, reclass, per CFO, topside, misc, suspense, etc. |

**Benford's law.** The first-digit distribution of entry amounts ≥ $10 is compared with Benford's expected frequencies using mean absolute deviation (Nigrini thresholds: < 0.006 close, < 0.012 acceptable, < 0.015 marginal, otherwise nonconformity). Fewer than 100 entries is reported as too few. Recurring transactions such as payroll commonly cause nonconformity; use the chart to direct inquiry, not as a conclusion.

## 3. Selection (JE.4)

1. **Key items:** optionally, every entry at or above the auditor threshold (this may exceed the requested size).
2. **Risk-based:** the requested share of the remaining slots goes to the highest-scoring entries, ties broken by amount then JE ID. Entries with a score of 0 are never labeled risk-based.
3. **Random:** remaining slots are filled without replacement from all other entries using a seeded pseudo-random generator (mulberry32). The seed is recorded so a reviewer can re-perform the selection.

Additions and removals require a written reason and are logged with date and user. This is **not a statistical sample**; results must not be projected to the population.

## 4. Vouching (JE.5)

For each selected entry the auditor attaches supporting documents and records six attributes (✓ / ✗ / N/A): supported by documentation, amount agrees, correct period, appropriate classification, properly authorized, reasonable business purpose. Voucher amounts are totaled and compared with the entry amount automatically. Any ✗ prompts an exception conclusion and exception detail.

Vouchers are saved as `03_Vouchers/<JE ID>/<V-ref>_<file name>` with a SHA-256 hash, so the workpaper can link to and evidence each document.

## 5. Workpaper (JE.6)

The Excel workpaper contains: Cover (objective, population hash, conclusion, sign-off, tickmark legend), Completeness, TB Rollforward, Sample & Vouching, Voucher Index (relative hyperlinks), Risk Register, Sample Changes, Data Quality, GL Population, Methodology and Voucher Images. Keep the workpaper inside the engagement folder so voucher links resolve.

## Security and data handling

AuditJE runs entirely in the browser. A Content Security Policy blocks connections to any other origin, and the automated tests fail if the app makes an outside request. Engagement data is written only to the folder the user selects (Chrome/Edge) or held in memory for the tab (other browsers). The service worker caches only the app's own files for offline use, never engagement data. Folder retention, access control, encryption and backup remain the firm's responsibility. Use synthetic data in GitHub issues and tests.
