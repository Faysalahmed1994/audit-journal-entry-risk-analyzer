// Unit tests for the browser analysis engine. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../docs/assets/js/engine.js";
import { parseCSV, readTable } from "../docs/assets/js/io.js";

const L = (je, account, debit = 0, credit = 0, extra = {}) => ({
  source_row: 2, journal_id: je, line_id: "", posting_date: "2026-03-10", effective_date: "", account, account_name: "",
  debit: Math.round(debit * 100), credit: Math.round(credit * 100), description: "Routine", preparer: "clerk", approver: "", entry_time: "", hour: null,
  source: "AP", approval_status: "Approved", duplicate: false, ...extra,
});
const flags = (r, je) => r.entries.find((e) => e.journal_id === je).flagKeys;

test("amount parsing handles ledger formats as integer cents", () => {
  assert.equal(E.toCents("1,234.56"), 123456);
  assert.equal(E.toCents("(500.00)"), -50000);
  assert.equal(E.toCents("$75"), 7500);
  assert.equal(E.toCents("100.00 CR"), -10000);
  assert.equal(E.toCents("250-"), -25000);
  assert.equal(E.toCents(""), 0);
  assert.equal(E.toCents("abc"), null);
  assert.equal(E.toCents(0.1 + 0.2), 30);
});

test("dates: ISO, US with time component, Excel serials, month names, DMY", () => {
  assert.equal(E.parseDate("2026-06-30"), "2026-06-30");
  assert.equal(E.parseDate("12/15/2026 0:00"), "2026-12-15");
  assert.equal(E.parseDate("2026-12-15T13:45:00"), "2026-12-15");
  assert.equal(E.parseDate(46203), "2026-06-30");
  assert.equal(E.parseDate("15-Dec-2026"), "2026-12-15");
  assert.equal(E.parseDate("Dec 15, 2026"), "2026-12-15");
  assert.equal(E.parseDate("15/12/2026", "DMY"), "2026-12-15");
  assert.equal(E.parseDate("02/30/2026"), null);
  assert.equal(E.parseDate(new Date(Date.UTC(2026, 5, 30))), "2026-06-30");
});

test("entry time: plain times, AM/PM, full datetimes, Excel fractions, Date objects", () => {
  assert.equal(E.parseHour("21:42"), 21);
  assert.equal(E.parseHour("9:15 PM"), 21);
  assert.equal(E.parseHour("12:05 AM"), 0);
  assert.equal(E.parseHour("2026-12-15 23:15:00"), 23);
  assert.equal(E.parseHour(0.9375), 22);
  assert.equal(E.parseHour(new Date(Date.UTC(2026, 11, 15, 22, 0))), 22);
  assert.equal(E.parseHour("2026-12-15"), null);
});

test("after-hours flag works when the time is part of a datetime value", () => {
  const raw = [{ JE: "D", Date: "2026-03-10", Acct: "Cash", Dr: "10", Cr: "", Time: "2026-03-10 23:15:00" }, { JE: "D", Date: "2026-03-10", Acct: "Rev", Dr: "", Cr: "10", Time: "2026-03-10 23:15:00" }];
  const { lines } = E.normalize(raw, { journal_id: "JE", posting_date: "Date", account: "Acct", debit: "Dr", credit: "Cr", entry_time: "Time" });
  assert.ok(flags(E.analyze(lines), "D").includes("AFTER_HOURS"));
});

test("a single signed amount column is supported", () => {
  const raw = [{ id: "S1", d: "2026-03-10", a: "1000", amt: "250.00" }, { id: "S1", d: "2026-03-10", a: "4000", amt: "-250.00" }];
  const map = E.autoMap(["id", "d", "a", "amt"]);
  assert.deepEqual(E.mappingErrors({ journal_id: "id", posting_date: "d", account: "a", amount: "amt" }), []);
  const { lines } = E.normalize(raw, { journal_id: "id", posting_date: "d", account: "a", amount: "amt" });
  assert.equal(lines[0].debit, 25000); assert.equal(lines[1].credit, 25000);
  assert.ok(map); // autoMap does not throw on unknown headers
});

test("autoMap recognizes common ERP headers and prefers debit/credit over amount", () => {
  const m = E.autoMap(["JE Number", "Post Date", "GL Account", "Debit Amount", "Credit Amount", "Amount", "Created By", "Approved By"]);
  assert.equal(m.journal_id, "JE Number"); assert.equal(m.posting_date, "Post Date"); assert.equal(m.account, "GL Account");
  assert.equal(m.debit, "Debit Amount"); assert.equal(m.credit, "Credit Amount"); assert.equal(m.amount, undefined);
  assert.equal(m.preparer, "Created By"); assert.equal(m.approver, "Approved By");
});

test("duplicate entries are detected across different journal IDs", () => {
  const r = E.analyze([L("A", "Cash", 500), L("A", "Rev", 0, 500), L("B", "Cash", 500), L("B", "Rev", 0, 500), L("C", "Cash", 70), L("C", "Rev", 0, 70)]);
  assert.ok(flags(r, "A").includes("DUP_ENTRY")); assert.ok(flags(r, "B").includes("DUP_ENTRY")); assert.ok(!flags(r, "C").includes("DUP_ENTRY"));
});

test("post-closing and near period-end entries are flagged", () => {
  const s = { periodStart: "2025-07-01", periodEnd: "2026-06-30" };
  const r = E.analyze([L("P", "Cash", 10, 0, { posting_date: "2026-07-14" }), L("P", "Rev", 0, 10, { posting_date: "2026-07-14" }), L("Y", "Cash", 10, 0, { posting_date: "2026-06-29" }), L("Y", "Rev", 0, 10, { posting_date: "2026-06-29" })], s);
  assert.ok(flags(r, "P").includes("POST_CLOSE")); assert.ok(flags(r, "Y").includes("YEAR_END")); assert.ok(!flags(r, "Y").includes("POST_CLOSE"));
});

test("self-approval, backdating, vague descriptions and unbalanced entries", () => {
  const r = E.analyze([
    L("Q", "Cash", 10, 0, { preparer: "cfo", approver: "CFO", description: "reclass per CFO", effective_date: "2026-01-01" }), L("Q", "Rev", 0, 9, { preparer: "cfo", approver: "CFO", description: "reclass per CFO", effective_date: "2026-01-01" }),
  ]);
  const f = flags(r, "Q");
  for (const k of ["SELF_APPROVED", "BACKDATED", "VAGUE", "UNBALANCED"]) assert.ok(f.includes(k), k);
  assert.ok(r.entryExceptions.some((x) => x.type === "Unbalanced entry"));
});

test("seldom-used accounts and infrequent preparers need a large enough population", () => {
  const lines = [];
  for (let i = 0; i < 40; i++) lines.push(L(`R${i}`, "Cash", 100 + i), L(`R${i}`, "Rev", 0, 100 + i));
  lines.push(L("X", "Legal settlements", 900, 0, { preparer: "temp" }), L("X", "Cash", 0, 900, { preparer: "temp" }));
  const f = flags(E.analyze(lines), "X");
  assert.ok(f.includes("SELDOM_ACCOUNT")); assert.ok(f.includes("UNUSUAL_USER"));
  assert.ok(!flags(E.analyze(lines.slice(-6)), "X").includes("SELDOM_ACCOUNT"), "skipped for tiny populations");
});

test("sampling: key items, risk-based only when score > 0, reproducible random", () => {
  const lines = [];
  for (let i = 0; i < 60; i++) lines.push(L(`J${i}`, "Cash", 101 + i), L(`J${i}`, "Rev", 0, 101 + i));
  lines.push(L("BIG", "Cash", 50000), L("BIG", "Rev", 0, 50000));
  const { entries } = E.analyze(lines, { largePercentile: 100 });
  const opts = { size: 10, riskPercent: 100, seed: 7, keyItems: true, thresholdCents: 4000000 };
  const a = E.selectSample(entries, opts), b = E.selectSample(entries, opts);
  assert.deepEqual(a, b);
  assert.equal(a[0].journal_id, "BIG"); assert.equal(a[0].basis, "Key item");
  for (const x of a.filter((x) => x.basis === "Risk-based")) assert.ok(entries.find((e) => e.journal_id === x.journal_id).score > 0);
  assert.equal(a.length, 10); assert.equal(new Set(a.map((x) => x.journal_id)).size, 10);
  assert.notDeepEqual(E.selectSample(entries, { ...opts, seed: 8 }), a);
});

test("completeness: control totals, sequence gaps, period coverage and TB roll-forward", () => {
  const lines = [];
  for (const n of [1, 2, 3, 5, 6, 9]) lines.push(L(`JE-${String(n).padStart(4, "0")}`, "1010 Cash", 100), L(`JE-${String(n).padStart(4, "0")}`, "4010 Revenue", 0, 100));
  const s = { ...E.defaultSettings(), periodStart: "2026-03-01", periodEnd: "2026-03-31" };
  const { entries } = E.analyze(lines, s);
  const tb = [{ account: "1010", beginning: 0, ending: 60000 }, { account: "4010", beginning: 0, ending: -59000 }];
  const c = E.completeness(lines, entries, s, { lines: "12", debits: "600.00" }, tb);
  assert.equal(c.gapCount, 3); assert.deepEqual(c.gaps.map((g) => g.from), ["JE-0004", "JE-0007"]);
  assert.ok(c.checks.find((x) => /Line count/.test(x.check)).pass);
  assert.ok(c.checks.find((x) => /Total debits/.test(x.check)).pass);
  const rf = c.rollforward.rows;
  assert.ok(rf.find((r) => r.account === "1010").pass, "account matched by code prefix");
  assert.equal(rf.find((r) => r.account === "4010").difference, -1000);
});

test("Benford test reports sample-size limits", () => {
  const b = E.benford([{ magnitude: 12345 }, { magnitude: 99999 }]);
  assert.equal(b.n, 2); assert.match(b.conformity, /Too few/);
});

test("voucher amounts are compared with the entry", () => {
  const e = { magnitude: 4250000 };
  assert.deepEqual(E.voucherCheck(e, [{ amount: "42,500.00" }]), { total: 4250000, difference: 0, agrees: true });
  assert.equal(E.voucherCheck(e, [{ amount: "40000" }, { amount: "2000" }]).difference, -50000);
  assert.equal(E.voucherCheck(e, []).agrees, null);
});

test("CSV parser handles quotes, embedded commas/newlines, semicolons and BOM", () => {
  assert.deepEqual(parseCSV('﻿a,b\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
  assert.deepEqual(parseCSV('a;b\n1;"2\n3"\n'), [["a", "b"], ["1", "2\n3"]]);
});

test("the synthetic sample population exercises every planted anomaly", async () => {
  const buf = readFileSync(new URL("../docs/assets/sample/synthetic_journal_entries.csv", import.meta.url));
  const t = await readTable("x.csv", buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const { lines, exceptions } = E.normalize(t.rows, E.autoMap(t.headers));
  assert.equal(exceptions.length, 0);
  const r = E.analyze(lines, { periodStart: "2025-07-01", periodEnd: "2026-06-30", thresholdCents: 25000000 });
  const seen = new Set(r.entries.flatMap((e) => e.flagKeys));
  for (const k of ["UNBALANCED", "WEEKEND", "AFTER_HOURS", "POST_CLOSE", "SELF_APPROVED", "DUP_ENTRY", "SELDOM_ACCOUNT", "UNUSUAL_USER", "VAGUE", "NOT_APPROVED", "MISSING_PREPARER", "MANUAL", "ROUND"]) assert.ok(seen.has(k), k);
});
