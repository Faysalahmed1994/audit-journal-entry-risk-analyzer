# Journal-entry audit screening methodology (prototype v0.1)

## Intended use

AuditJE is a **rule-based screening and selection support tool** for external auditors. It does not assert that a flagged entry is fraudulent, improper or material. Screening supports professional judgment but cannot replace management override procedures, walkthroughs, independent source reconciliations, sufficient appropriate audit evidence, or reviewer sign-off.

## Population and completeness

1. Obtain the source JE listing directly from the authorized accounting system, with a documented period, posting status, report parameters, and exclusions.
2. Reconcile line count and debit/credit sums with independently obtained control totals where available. Enter control totals *before* analysis. Non-zero differences require investigation.
3. Review blank JE IDs, missing dates/accounts, duplicate line IDs, duplicate-looking lines, negative amounts, or unbalanced JEs. These are **indicators** requiring follow-up, not conclusive errors.
4. Compare JE populations to the GL or trial balance and evaluate missing journals, voids, reversals, and period completeness externally. A balanced import does **not** demonstrate a complete population.

## Unit of analysis

Risk scoring and sample selection occur at the **journal-entry** level; all lines with the same JE ID are grouped. GL line-level exceptions remain in the workpaper.

## Risk flag weights

| Flag | Points | Detection |
|---|---:|---|
| Unbalanced entry | 35 | JE debits and credits differ by more than $0.01 |
| Weekend posting | 15 | Posting date falls Saturday or Sunday |
| After-hours entry | 15 | Provided entry time earlier than 07:00 or at/after 19:00 |
| Large value | 25 | At/above the 90th-percentile entry magnitude when there are at least 10 JEs |
| Round amount | 10 | Entry magnitude is at least $1,000 and divisible by $1,000 |
| Manual source | 15 | Source labeled Manual, Manual JE, Excel or Spreadsheet |
| Near fiscal year-end | 15 | Posting date within the final five calendar days before and including the specified fiscal year-end |
| Missing preparer | 10 | Preparer is absent from every line of the JE |
| Not approved | 20 | Any approval status is Pending, Rejected, Unapproved or Not Approved |
| Potential duplicate line | 20 | JE ID, date, account, debit, credit, narration exactly repeat a prior line |

Risk score is capped at 100. **High** >=50, **Medium** 20–49, **Low** <20. These thresholds are heuristics, **not calibrated probabilities**. Amount risk uses the larger of the absolute aggregate debits and credits (for ordinary nonnegative accounting entries).

## Selection

- Selection is risk-first, taking the highest scored entries (ties: largest amount then JE ID) for the rounded-up configured risk fraction.
- Remaining slots are randomly selected without replacement from the rest of the population using Python's deterministic pseudo-random generator and the stored random seed.
- Record the sample size, risk share, seed, materiality or other auditor-defined selection parameters, and reasons for using this approach. This is **not** statistically representative sampling and should not be used to extrapolate misstatement rates.
- Review and override selections under firm methodology where needed; manual overrides are not supported in v0.1.

## Workpaper exports

Excel sheets include Overview, Entry Risk Register, GL Lines, JE Sample Workpaper, Data Quality, Control Totals, Methodology and (when uploaded) Evidence Images. Manual sign-off / test result fields are intentionally blank. Screenshots are **manually** attached by an auditor; no OCR or accounting-system integrations run.

## Security and constraints

Only listen on localhost `127.0.0.1`. Data are not persisted by the application; analysis remains in server process memory until replaced or closed, and the output is saved to a user-selected location by the browser. External GitHub Actions CI uses **synthetic data only**. No files from clients should be committed to GitHub, used as test fixtures, or uploaded to AI services without authorization. Review retention, secure disposal, access control, and encryption before a real-world pilot.
