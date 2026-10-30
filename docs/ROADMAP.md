# Roadmap and milestones

## v0.1 — local prototype (included)
- [x] Offline localhost web UI (Python + standard-library server)
- [x] CSV and Excel `.xlsx` import; data mapping
- [x] JE-level risk score and rule explanations
- [x] Data quality / partial completeness indicators
- [x] Risk-based + deterministic random sampling
- [x] XLSX audit workpaper with blank testing documentation fields
- [x] Auditor-added voucher screenshots embedded in the Excel workpaper
- [x] Test fixtures, tests and methodology

## v0.2 — browser web app (included)
- [x] Static web app on GitHub Pages; all processing in the browser, no uploads
- [x] Engagement folder (File System Access API) with population, voucher and workpaper subfolders and autosaved progress
- [x] Column mapping UI; signed-amount files; flexible dates, times and amount formats
- [x] Completeness: control totals, TB roll-forward, period coverage, journal number gaps, population hash
- [x] 19 fraud-risk characteristics (AU-C 240 / AS 2401) with adjustable weights; Benford first-digit test
- [x] User-defined period, threshold (key items) and rule settings
- [x] Key item + risk-based + seeded random selection; reasoned overrides with audit trail
- [x] Vouching: attach documents, voucher references, attribute testing, exceptions
- [x] Excel workpaper with hyperlinked voucher index, sign-offs and methodology
- [x] Unit tests and full browser end-to-end test in CI

## v0.3 — methodology depth
- [ ] Account-level rules (e.g., unusual revenue/cash pairings) using an account type column
- [ ] Reversing entries and reversal matching
- [ ] Multi-entity and multi-fund populations; JE-ID collisions across funds
- [ ] Reviewer mode: review notes and sign-off per sampled entry
- [ ] Performance testing above 1 million lines (Web Worker parsing)

## v0.4 — evidence capture
- [x] Drag and drop voucher support (delivered in v0.2)
- [ ] PDF excerpts and image annotations
- [ ] OCR-assisted extraction restricted to on-device libraries
- [ ] Automatic invoice number/amount cross-check subject to independent verification
- [ ] Reusable firm's workpaper template mappings
- [ ] Role-based local access and encrypted evidence store

## v1.0 — validated, distributable desktop package
- [ ] Firm-methodology review, risk thresholds back-test against independently labeled cases
- [ ] Security assessment and local file encryption
- [x] No installation needed: runs in the browser and can be installed as an app from Chrome/Edge (v0.2)
- [ ] Repeatable benchmark using synthetic/openly licensed datasets
- [ ] Independent auditor pilot with written consent and feedback
- [ ] Public documentation of time saved, error rates, and limitations

## Evaluation plan for NIW supporting evidence

1. Maintain dated releases, GitHub history, technical documentation and reproducible synthetic test cases.
2. Show relevance to audits of U.S. local governments, nonprofit organizations and firms; explain how reusable analytics could improve audit process efficiency (not just work for one employer).
3. Obtain independent, authorized pilot user testing and permission to cite anonymized feedback and work samples. Do not fabricate adoption, referrals, endorsements or impact.
4. Benchmark processing time, findings against a defined test population, false positives, and usability compared with current spreadsheet-only procedures.
5. Publish technical notes or a paper describing selection logic, limitations and validation with reproducible examples.
6. Keep potential petitions focused on a broader proposed endeavor, not treating a GitHub repository or speculative benefits as proof of national importance.
