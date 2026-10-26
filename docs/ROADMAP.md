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

## v0.2 — audit methodology and assurance
- [ ] User-defined audit periods, materiality and account-level rule weighting
- [ ] Control totals cross-checking against TB/GL outside uploaded JE file
- [ ] Robust two-sided/sign-adjusted journal extraction, source-system templates
- [ ] Multi-entity and fiscal-year handling / JE-ID collisions
- [ ] JE posting vs effective date, reversed entries, sequential ID gaps where valid
- [ ] Scalable import (large general ledgers) and performance testing
- [ ] Reviewer override / documented sample modifications and audit trail

## v0.3 — evidence capture
- [ ] Drag and drop invoice/voucher support, PDF excerpts and image annotations
- [ ] OCR-assisted extraction restricted to on-device libraries
- [ ] Automatic invoice number/amount cross-check subject to independent verification
- [ ] Reusable firm's workpaper template mappings
- [ ] Role-based local access and encrypted evidence store

## v1.0 — validated, distributable desktop package
- [ ] Firm-methodology review, risk thresholds back-test against independently labeled cases
- [ ] Security assessment and local file encryption
- [ ] Windows installer (.exe), no Python setup needed after installation
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
