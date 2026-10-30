// Generates the fully synthetic demo population and trial balance used by the web app and tests.
// Run: node tools/generate-sample.mjs   (deterministic; no real entity data)
import { writeFileSync, mkdirSync } from "node:fs";
import { mulberry32 } from "../docs/assets/js/engine.js";

const rng = mulberry32(20260630);
const pick = (a) => a[Math.floor(rng() * a.length)];
const between = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const ACCTS = {
  cash: "1010 Cash - Operating", ar: "1210 Taxes Receivable", due: "1410 Due From Other Funds", cap: "1810 Capital Assets",
  ap: "2010 Accounts Payable", payroll: "2110 Accrued Payroll", deferred: "2310 Unearned Revenue",
  tax: "4010 Property Tax Revenue", grant: "4310 Intergovernmental Grants", fees: "4410 Charges for Services", misc: "4910 Miscellaneous Revenue",
  wages: "5010 Salaries and Wages", benefits: "5110 Employee Benefits", supplies: "5210 Supplies", contract: "5310 Contractual Services",
  utilities: "5410 Utilities", capout: "5810 Capital Outlay", legal: "5950 Legal Settlements",
};
const BEGIN = { [ACCTS.cash]: 245000000, [ACCTS.ar]: 61200000, [ACCTS.due]: 4500000, [ACCTS.cap]: 0, [ACCTS.ap]: -18750000, [ACCTS.payroll]: -9400000, [ACCTS.deferred]: -12000000 };
const FUND_BAL = "3010 Fund Balance";
const clerks = ["mjohnson", "agarcia", "tnguyen"];
const approvers = ["finance.director", "controller"];
const start = Date.UTC(2025, 6, 1);
const days = 365;
const lines = [];
let jeNum = 1000;
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
function businessDay() { let t; do { t = start + between(0, days - 1) * 86400000; } while ([0, 6].includes(new Date(t).getUTCDay())); return t; }
function time(lo = 8, hi = 17) { return `${String(between(lo, hi)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`; }
function je(t, pairs, o = {}) {
  const id = o.id || `JE-${++jeNum}`;
  const prep = o.preparer ?? pick(clerks);
  const tm = o.time || time();
  pairs.forEach(([acct, dr, cr], i) => lines.push({
    journal_id: id, line_id: String(i + 1).padStart(3, "0"), posting_date: fmtDate(t), effective_date: o.effective || fmtDate(t), account: acct,
    debit: dr ? (dr / 100).toFixed(2) : "0", credit: cr ? (cr / 100).toFixed(2) : "0", description: o.desc ?? "",
    preparer: prep, approved_by: o.approver ?? pick(approvers), entry_time: tm, source: o.source || "AP", approval_status: o.status || "Approved",
  }));
  return id;
}
// Log-uniform amounts so the synthetic population behaves like real ledgers (Benford-like first digits).
const amt = (lo, hi) => Math.round(Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo))) * 100);
// Routine activity.
for (let i = 0; i < 26; i++) { const t = start + (i * 14 + 3) * 86400000; const w = amt(180000, 210000); je(t, [[ACCTS.wages, w, 0], [ACCTS.cash, 0, w]], { desc: `Payroll period ${i + 1}`, source: "Payroll" }); const b = Math.round(w * 0.31); je(t, [[ACCTS.benefits, b, 0], [ACCTS.payroll, 0, b]], { desc: `Benefits accrual period ${i + 1}`, source: "Payroll" }); }
for (let i = 0; i < 120; i++) { const t = businessDay(); const a = amt(40, 18000); const exp = pick([ACCTS.supplies, ACCTS.contract, ACCTS.utilities]); je(t, [[exp, a, 0], [ACCTS.ap, 0, a]], { desc: `Vendor invoice ${between(10000, 99999)} - ${exp.slice(5)}`, source: "AP" }); }
for (let i = 0; i < 110; i++) { const t = businessDay(); const a = amt(40, 18000); je(t, [[ACCTS.ap, a, 0], [ACCTS.cash, 0, a]], { desc: `Check run ${between(5000, 9999)}`, source: "AP" }); }
for (let i = 0; i < 60; i++) { const t = businessDay(); const a = amt(20000, 260000); je(t, [[ACCTS.cash, a, 0], [ACCTS.ar, 0, a]], { desc: `Property tax collections batch ${i + 1}`, source: "Cash Receipts" }); }
for (let i = 0; i < 12; i++) { const t = Date.UTC(2025, 6 + i, 1); const a = amt(380000, 520000); je(t, [[ACCTS.ar, a, 0], [ACCTS.tax, 0, a]], { desc: `Property tax levy recognition month ${i + 1}`, source: "GL" }); }
for (let i = 0; i < 40; i++) { const t = businessDay(); const a = amt(300, 8000); je(t, [[ACCTS.cash, a, 0], [ACCTS.fees, 0, a]], { desc: `Permit and service fees deposit ${i + 1}`, source: "Cash Receipts" }); }
for (let i = 0; i < 4; i++) { const t = businessDay(); const a = amt(90000, 240000); je(t, [[ACCTS.cash, a, 0], [ACCTS.grant, 0, a]], { desc: `State grant reimbursement Q${i + 1}`, source: "Cash Receipts" }); }
for (let i = 0; i < 6; i++) { const t = businessDay(); const a = amt(20000, 150000); je(t, [[ACCTS.capout, a, 0], [ACCTS.ap, 0, a]], { desc: `Street improvement contractor pay app ${i + 1}`, source: "AP" }); }
// Planted anomalies (synthetic, for demonstrating each rule).
const ye = Date.UTC(2026, 5, 30);
je(Date.UTC(2026, 5, 27), [[ACCTS.misc, 25000000, 0], [ACCTS.grant, 0, 25000000]], { desc: "reclass per CFO", source: "Manual", time: "21:42", preparer: "finance.director", approver: "finance.director" });
je(ye, [[ACCTS.ar, 18000000, 0], [ACCTS.grant, 0, 18000000]], { desc: "adj", source: "Manual", time: "18:55" });
je(Date.UTC(2026, 6, 14), [[ACCTS.contract, 4250000, 0], [ACCTS.ap, 0, 4250000]], { desc: "Accrue June engineering services", source: "Manual", effective: "2026-06-30" });
je(Date.UTC(2025, 10, 15), [[ACCTS.supplies, 1240000, 0], [ACCTS.cash, 0, 1240000]], { desc: "Office furniture", source: "AP", time: "10:05" }); // Saturday
const dupDesc = "Vendor invoice 88412 - Contractual Services";
je(Date.UTC(2026, 2, 10), [[ACCTS.contract, 1875000, 0], [ACCTS.ap, 0, 1875000]], { desc: dupDesc });
je(Date.UTC(2026, 2, 12), [[ACCTS.contract, 1875000, 0], [ACCTS.ap, 0, 1875000]], { desc: dupDesc });
je(Date.UTC(2026, 3, 22), [[ACCTS.legal, 9500000, 0], [ACCTS.cash, 0, 9500000]], { desc: "Settlement", source: "Manual", preparer: "temp.user", status: "Pending" });
je(Date.UTC(2026, 0, 8), [[ACCTS.due, 3000000, 0], [ACCTS.cash, 0, 3000000]], { desc: "", source: "GL", preparer: "" });
je(Date.UTC(2026, 4, 5), [[ACCTS.supplies, 412000, 0], [ACCTS.ap, 0, 410000]], { desc: "Janitorial supplies", source: "AP" }); // unbalanced
je(Date.UTC(2026, 1, 3), [[ACCTS.cap, 6000000, 0], [ACCTS.capout, 0, 6000000]], { desc: "Capitalize fire engine", source: "GL" });
// Remove a few journal numbers to create sequence gaps (voids / deleted entries).
const removed = new Set(["JE-1137", "JE-1138", "JE-1301"]);
const kept = lines.filter((l) => !removed.has(l.journal_id));
kept.sort((a, b) => a.posting_date.localeCompare(b.posting_date) || a.journal_id.localeCompare(b.journal_id) || a.line_id.localeCompare(b.line_id));
const cols = Object.keys(kept[0]);
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
mkdirSync(new URL("../docs/assets/sample/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/assets/sample/synthetic_journal_entries.csv", import.meta.url), [cols.join(","), ...kept.map((l) => cols.map((c) => csvCell(l[c])).join(","))].join("\n") + "\n");
// Trial balance that rolls forward from in-period activity (one account deliberately off by $500).
const act = {};
for (const l of kept) if (l.posting_date <= "2026-06-30") act[l.account] = (act[l.account] || 0) + Math.round(+l.debit * 100) - Math.round(+l.credit * 100);
const all = [...new Set([...Object.values(ACCTS), ...Object.keys(BEGIN)])].sort();
const tbRows = all.map((a) => ({ a, b: BEGIN[a] || 0, e: (BEGIN[a] || 0) + (act[a] || 0) }));
const fb = -tbRows.reduce((s, r) => s + r.b, 0);
tbRows.push({ a: FUND_BAL, b: fb, e: fb });
tbRows.find((r) => r.a === ACCTS.utilities).e += 50000;
writeFileSync(new URL("../docs/assets/sample/synthetic_trial_balance.csv", import.meta.url), "account,beginning_balance,ending_balance\n" + tbRows.map((r) => `${csvCell(r.a)},${(r.b / 100).toFixed(2)},${(r.e / 100).toFixed(2)}`).join("\n") + "\n");
console.log(`Wrote ${kept.length} lines / ${new Set(kept.map((l) => l.journal_id)).size} entries and a ${tbRows.length}-account TB.`);
