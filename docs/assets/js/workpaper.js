/* Builds the Excel audit workpaper in the browser with ExcelJS. */
import { FLAGS, VERSION, voucherCheck } from "./engine.js";

const NAVY = "FF16324F", LIGHT = "FFEAF1F8", GREEN = "FFE3F4E8", RED = "FFFBE4E4", AMBER = "FFFFF4D6", GREY = "FF5B6B7C";
const MONEY = '#,##0.00;[Red](#,##0.00);"-"';
const c2d = (c) => (c === null || c === undefined || c === "" ? null : c / 100);

function table(ws, headers, rows, opts = {}) {
  const start = opts.startRow || ws.rowCount + 1;
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, printTitlesRow: `${start}:${start}` };
  ws.headerFooter = { oddFooter: `&L${(ws.name || "").replace(/&/g, "&&")}&RPage &P of &N` };
  const hr = ws.getRow(start);
  headers.forEach((h, i) => { const cell = hr.getCell(i + 1); cell.value = h.label; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; cell.alignment = { vertical: "middle", wrapText: true }; cell.border = { bottom: { style: "thin", color: { argb: NAVY } } }; });
  hr.height = 30;
  rows.forEach((r, ri) => {
    const row = ws.getRow(start + 1 + ri);
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      let v = typeof h.get === "function" ? h.get(r) : r[h.key];
      if (h.money) v = typeof v === "number" ? v / 100 : v;
      cell.value = v === undefined ? null : v;
      if (h.money) cell.numFmt = MONEY;
      if (h.pct) cell.numFmt = "0.0%";
      if (h.wrap) cell.alignment = { wrapText: true, vertical: "top" };
      else cell.alignment = { vertical: "top" };
    });
    if (opts.rowStyle) opts.rowStyle(row, r);
  });
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = h.width || Math.min(40, Math.max(12, h.label.length + 4)); });
  if (rows.length && opts.filter !== false) ws.autoFilter = { from: { row: start, column: 1 }, to: { row: start + rows.length, column: headers.length } };
  if (opts.freeze !== false) ws.views = [{ state: "frozen", ySplit: start, xSplit: opts.xSplit || 0 }];
  return start + rows.length;
}

function title(ws, text, sub) {
  ws.getCell("A1").value = text; ws.getCell("A1").font = { size: 15, bold: true, color: { argb: NAVY } };
  if (sub) { ws.getCell("A2").value = sub; ws.getCell("A2").font = { italic: true, color: { argb: GREY } }; }
}
const fill = (row, argb) => row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; });

export async function buildWorkpaper(ExcelJS, ctx, readFile) {
  const { engagement: eng, settings: s, population: pop, entries, lines, exceptions, comp, benford, sample, vouching, overrides } = ctx;
  const byId = new Map(entries.map((e) => [e.journal_id, e]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "AuditJE " + VERSION; wb.created = new Date();
  const ref = (n) => `${eng.wpRef || "JE"}.${n}`;

  /* Cover ------------------------------------------------------------- */
  const cv = wb.addWorksheet("Cover", { properties: { tabColor: { argb: NAVY } } });
  cv.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  cv.getColumn(1).width = 34; cv.getColumn(2).width = 70; cv.getColumn(3).width = 18; cv.getColumn(4).width = 18;
  cv.getCell("A1").value = "JOURNAL ENTRY TESTING WORKPAPER"; cv.getCell("A1").font = { size: 18, bold: true, color: { argb: NAVY } };
  cv.getCell("A2").value = `${eng.client || "Client"} — period ${s.periodStart || "?"} to ${s.periodEnd || "?"}`; cv.getCell("A2").font = { size: 12, color: { argb: GREY } };
  const info = [
    ["Workpaper reference", eng.wpRef || "JE"], ["Client / entity", eng.client], ["Engagement", eng.engagementName], ["Fiscal period", `${s.periodStart} to ${s.periodEnd}`],
    ["Objective", "Respond to the risk of management override of controls (AU-C 240 / AS 2401): test the completeness of the journal entry population, identify entries with fraud-risk characteristics, select entries for testing, and vouch selected entries to supporting documentation."],
    ["Population file", pop.fileName], ["Saved copy", pop.savedPath || "(session only — not saved to a folder)"], ["SHA-256 of population file", pop.sha256],
    ["Imported", pop.importedAt], ["Lines / journal entries", `${lines.length.toLocaleString()} lines / ${entries.length.toLocaleString()} entries`],
    ["Auditor threshold (e.g., performance materiality)", s.thresholdCents ? s.thresholdCents / 100 : "Not set"],
    ["Sample", `${sample.length} entries (${countBy(sample, "basis")})`],
    ["Vouching status", vouchSummary(sample, vouching)], ["Tool", `AuditJE ${VERSION} (rules-based; browser-local processing)`],
  ];
  let r = 4;
  for (const [k, v] of info) { cv.getCell(`A${r}`).value = k; cv.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } }; cv.getCell(`B${r}`).value = v ?? ""; cv.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" }; if (typeof v === "number") cv.getCell(`B${r}`).numFmt = MONEY; r++; }
  cv.getRow(8).height = 60;
  r++;
  cv.getCell(`A${r}`).value = "Conclusion"; cv.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }; r++;
  cv.getCell(`A${r}`).value = eng.conclusion || "[Auditor to document conclusion]"; cv.mergeCells(`A${r}:D${r}`); cv.getRow(r).height = 70; cv.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" }; cv.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER } }; r += 2;
  const sign = [["Prepared by", eng.preparedBy, eng.preparedOn], ["Reviewed by", eng.reviewedBy, eng.reviewedOn]];
  cv.getCell(`A${r}`).value = "Sign-off"; cv.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }; cv.getCell(`C${r}`).value = "Date"; cv.getCell(`C${r}`).font = { bold: true }; r++;
  for (const [k, who, when] of sign) { cv.getCell(`A${r}`).value = k; cv.getCell(`A${r}`).font = { bold: true }; cv.getCell(`B${r}`).value = who || ""; cv.getCell(`C${r}`).value = when || ""; for (const c of ["B", "C"]) cv.getCell(`${c}${r}`).border = { bottom: { style: "thin" } }; r++; }
  r++;
  cv.getCell(`A${r}`).value = "Tickmark legend"; cv.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }; r++;
  for (const [t, d] of [["✓", "Agreed to supporting documentation without exception"], ["✗", "Exception noted — see exception detail"], ["N/A", "Attribute not applicable to this entry"], ["V-###", "Voucher reference; file in 03_Vouchers (see Voucher Index)"]]) { cv.getCell(`A${r}`).value = t; cv.getCell(`B${r}`).value = d; r++; }
  r++;
  cv.getCell(`A${r}`).value = "Limitations"; cv.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
  cv.getCell(`B${r}`).value = "Risk scores are transparent heuristics, not fraud determinations. Import checks do not by themselves prove completeness — reconcile the extract to the GL/TB and evaluate report parameters. Risk-based and random selections are not a statistical sample and must not be used to project misstatement.";
  cv.getCell(`B${r}`).alignment = { wrapText: true }; cv.getRow(r).height = 60;

  /* Completeness ------------------------------------------------------- */
  const cs = wb.addWorksheet("Completeness");
  title(cs, `${ref(1)} Population completeness and integrity`, "Procedures performed on the journal entry population before selection.");
  let next = table(cs, [
    { label: "Procedure", key: "check", width: 58, wrap: true },
    { label: "Expected", get: (x) => (x.money ? c2d(x.expected) : x.expected), width: 18 },
    { label: "Population", get: (x) => (x.money ? c2d(x.actual) : x.actual), width: 18 },
    { label: "Difference", get: (x) => (x.money ? c2d(x.difference) : x.difference), width: 16 },
    { label: "Result", get: (x) => (x.pass ? "✓ Agrees" : "✗ Investigate"), width: 15 },
    { label: "Detail / follow-up", get: (x) => x.note || "", width: 60, wrap: true },
  ], comp.checks, { startRow: 4, filter: false, rowStyle: (row, x) => { fill(row, x.pass ? GREEN : RED); for (const i of [2, 3, 4]) if (x.money) row.getCell(i).numFmt = MONEY; } });
  next += 2;
  cs.getCell(`A${next}`).value = "Period coverage"; cs.getCell(`A${next}`).font = { bold: true, color: { argb: NAVY } }; next++;
  cs.getCell(`A${next}`).value = `First posting ${comp.coverage.first || "—"}; last posting ${comp.coverage.last || "—"}; undated lines ${comp.coverage.undated}.`; next += 2;
  next = table(cs, [{ label: "Month", key: "month", width: 58 }, { label: "Entries", key: "entries" }, { label: "Amount", key: "amount", money: true }], comp.coverage.months, { startRow: next, filter: false, freeze: false });
  if (comp.gaps.length) {
    next += 2; cs.getCell(`A${next}`).value = "Journal number gaps (obtain explanations)"; cs.getCell(`A${next}`).font = { bold: true, color: { argb: NAVY } }; next++;
    table(cs, [{ label: "Missing from", key: "from", width: 58 }, { label: "Missing to", key: "to" }, { label: "Count", key: "count" }, { label: "Explanation obtained", get: () => "" }], comp.gaps, { startRow: next, filter: false, freeze: false });
  }

  /* TB roll-forward ---------------------------------------------------- */
  if (comp.rollforward) {
    const tb = wb.addWorksheet("TB Rollforward");
    title(tb, `${ref(2)} Trial balance roll-forward`, "Beginning balance + journal entry activity in the period = ending balance (Dr +, Cr −).");
    const rf = comp.rollforward.rows.concat(comp.rollforward.unmatched.map((u) => ({ account: u.account, account_name: u.account_name + " (not on TB)", beginning: null, activity: u.activity, ending: null, difference: u.activity, pass: false })));
    table(tb, [
      { label: "Account", key: "account", width: 34 }, { label: "Name", key: "account_name", width: 28 }, { label: "Beginning", key: "beginning", money: true, width: 16 },
      { label: "JE activity", key: "activity", money: true, width: 16 }, { label: "Ending per TB", key: "ending", money: true, width: 16 }, { label: "Difference", key: "difference", money: true, width: 14 },
      { label: "Result", get: (x) => (x.pass ? "✓" : "✗"), width: 8 }, { label: "Explanation", get: () => "", width: 40 },
    ], rf, { startRow: 4, rowStyle: (row, x) => { if (!x.pass) fill(row, RED); } });
  }

  /* Sample & vouching -------------------------------------------------- */
  const sv = wb.addWorksheet("Sample & Vouching", { properties: { tabColor: { argb: "FF2E7D32" } } });
  title(sv, `${ref(3)} Journal entries selected for testing and vouching results`, "Attributes: ✓ agreed, ✗ exception, N/A. Voucher references link to files in 03_Vouchers.");
  const yn = (v) => (v === "Yes" ? "✓" : v === "No" ? "✗" : v === "N/A" ? "N/A" : "");
  const sampleRows = sample.map((x, i) => {
    const e = byId.get(x.journal_id) || {}; const v = vouching[x.journal_id] || {}; const vs = v.vouchers || [];
    const chk = voucherCheck(e, vs);
    return { n: i + 1, x, e, v, vs, chk };
  });
  const svEnd = table(sv, [
    { label: "#", get: (o) => o.n, width: 5 }, { label: "JE ID", get: (o) => o.x.journal_id, width: 14 }, { label: "Posting date", get: (o) => o.e.posting_date, width: 12 },
    { label: "JE amount", get: (o) => o.e.magnitude, money: true, width: 15 }, { label: "Accounts", get: (o) => (o.e.accounts || []).join("; "), width: 34, wrap: true },
    { label: "Description", get: (o) => o.e.description, width: 30, wrap: true }, { label: "Preparer", get: (o) => o.e.preparer, width: 14 },
    { label: "Selection basis", get: (o) => o.x.basis, width: 13 }, { label: "Risk score", get: (o) => o.e.score, width: 9 },
    { label: "Risk flags", get: (o) => (o.e.flags || []).map((f) => FLAGS[f.key].label).join("; "), width: 34, wrap: true },
    { label: "Voucher ref(s)", get: (o) => o.vs.map((d) => d.ref).join(", "), width: 14 },
    { label: "Voucher amount", get: (o) => o.chk.total, money: true, width: 15 }, { label: "Difference", get: (o) => o.chk.difference, money: true, width: 13 },
    { label: "Supported by documentation", get: (o) => yn(o.v.attrs?.supported), width: 12 }, { label: "Amount agrees", get: (o) => yn(o.v.attrs?.amount), width: 10 },
    { label: "Recorded in correct period", get: (o) => yn(o.v.attrs?.period), width: 11 }, { label: "Account classification appropriate", get: (o) => yn(o.v.attrs?.classification), width: 13 },
    { label: "Properly authorized", get: (o) => yn(o.v.attrs?.authorized), width: 11 }, { label: "Business purpose reasonable", get: (o) => yn(o.v.attrs?.purpose), width: 12 },
    { label: "Conclusion", get: (o) => o.v.conclusion || "Not tested", width: 14 }, { label: "Exception detail", get: (o) => o.v.exceptionDetail || "", width: 30, wrap: true },
    { label: "Auditor notes", get: (o) => o.v.notes || "", width: 34, wrap: true }, { label: "Tested by", get: (o) => o.v.testedBy || "", width: 12 }, { label: "Date tested", get: (o) => o.v.testedOn || "", width: 12 },
  ], sampleRows, { startRow: 4, xSplit: 2, rowStyle: (row, o) => {
    if (o.v.conclusion === "Exception") fill(row, RED); else if (o.v.conclusion === "No exception") fill(row, GREEN);
    if (o.vs[0]?.path && ctx.folderMode) { const cell = row.getCell(11); cell.value = { text: o.vs.map((d) => d.ref).join(", "), hyperlink: "../" + o.vs[0].path }; cell.font = { color: { argb: "FF1F5FBF" }, underline: true }; }
  } });
  sv.getCell(`A${svEnd + 2}`).value = "Totals"; sv.getCell(`A${svEnd + 2}`).font = { bold: true };
  sv.getCell(`D${svEnd + 2}`).value = { formula: `SUBTOTAL(9,D5:D${svEnd})` }; sv.getCell(`D${svEnd + 2}`).numFmt = MONEY;
  sv.getCell(`F${svEnd + 2}`).value = `Coverage of population amount: ${pct(sample.reduce((a, x) => a + (byId.get(x.journal_id)?.magnitude || 0), 0), entries.reduce((a, e) => a + e.magnitude, 0))}`;

  /* Voucher index ------------------------------------------------------ */
  const vi = wb.addWorksheet("Voucher Index");
  title(vi, `${ref(4)} Voucher index`, ctx.folderMode ? "Click a file name to open the voucher saved in the engagement folder." : "Session mode: voucher files were not saved to a folder; image vouchers are embedded on the Voucher Images tab.");
  const vRows = [];
  for (const x of sample) for (const d of (vouching[x.journal_id]?.vouchers || [])) vRows.push({ je: x.journal_id, ...d });
  table(vi, [
    { label: "Ref", key: "ref", width: 9 }, { label: "JE ID", key: "je", width: 14 }, { label: "Document type", key: "docType", width: 16 }, { label: "Document no.", key: "docNo", width: 16 },
    { label: "Document date", key: "docDate", width: 13 }, { label: "Vendor / payee", key: "payee", width: 24 }, { label: "Amount", get: (d) => { const c = d.amount === "" || d.amount == null ? null : Number(String(d.amount).replace(/[$,]/g, "")); return Number.isFinite(c) ? c : null; }, width: 14 },
    { label: "File", get: (d) => d.fileName, width: 44 }, { label: "SHA-256", key: "sha256", width: 20 }, { label: "Added", key: "addedAt", width: 18 },
  ], vRows, { startRow: 4, rowStyle: (row, d) => { row.getCell(7).numFmt = MONEY; if (d.path && ctx.folderMode) { const c = row.getCell(8); c.value = { text: d.path, hyperlink: "../" + d.path }; c.font = { color: { argb: "FF1F5FBF" }, underline: true }; } } });

  /* Risk register ------------------------------------------------------ */
  const rr = wb.addWorksheet("Risk Register");
  title(rr, `${ref(5)} Journal entry risk register (all entries)`, `Scores: High ≥ ${s.highScore}, Medium ≥ ${s.mediumScore}. Heuristic indicators — not fraud conclusions.`);
  const selected = new Map(sample.map((x) => [x.journal_id, x.basis]));
  table(rr, [
    { label: "JE ID", key: "journal_id", width: 14 }, { label: "Posting date", key: "posting_date", width: 12 }, { label: "Lines", key: "lines", width: 7 },
    { label: "Debits", key: "debit", money: true, width: 15 }, { label: "Credits", key: "credit", money: true, width: 15 }, { label: "Out of balance", key: "difference", money: true, width: 13 },
    { label: "Preparer", key: "preparer", width: 14 }, { label: "Source", key: "source", width: 12 }, { label: "Description", key: "description", width: 32 },
    { label: "Risk score", key: "score", width: 9 }, { label: "Tier", key: "tier", width: 9 },
    { label: "Risk flags", get: (e) => e.flags.map((f) => FLAGS[f.key].label + (f.detail ? ` (${f.detail})` : "")).join("; "), width: 60 },
    { label: "Selected", get: (e) => selected.get(e.journal_id) || "", width: 12 },
  ], entries, { startRow: 4, xSplit: 1, rowStyle: (row, e) => { const t = row.getCell(11); t.font = { bold: true, color: { argb: e.tier === "High" ? "FFB3261E" : e.tier === "Medium" ? "FF9A6700" : "FF2E7D32" } }; } });

  /* Sample changes ----------------------------------------------------- */
  const sc = wb.addWorksheet("Sample Changes");
  title(sc, `${ref(6)} Sample parameters and auditor changes`, "");
  const p = ctx.sampleParams || {};
  let sr = table(sc, [{ label: "Parameter", key: "k", width: 40 }, { label: "Value", key: "v", width: 50 }], [
    { k: "Requested sample size", v: p.size }, { k: "Risk-based share", v: `${p.riskPercent}%` }, { k: "Random seed (re-performable)", v: p.seed },
    { k: "Key items (≥ threshold) included", v: p.keyItems ? "Yes" : "No" }, { k: "Selected on", v: p.selectedAt || "" },
  ], { startRow: 4, filter: false, freeze: false });
  sr += 2;
  table(sc, [{ label: "When", key: "at", width: 40 }, { label: "Action", key: "action", width: 50 }, { label: "JE ID", key: "journal_id", width: 14 }, { label: "Reason", key: "reason", width: 50, wrap: true }, { label: "By", key: "by", width: 14 }], overrides, { startRow: sr, freeze: false });

  /* Data quality ------------------------------------------------------- */
  const dq = wb.addWorksheet("Data Quality");
  title(dq, `${ref(7)} Data quality indicators`, "Indicators requiring follow-up; not conclusive errors.");
  table(dq, [{ label: "Source row", key: "row", width: 10 }, { label: "JE ID", key: "journal_id", width: 16 }, { label: "Indicator", key: "type", width: 28 }, { label: "Detail", key: "detail", width: 70 }, { label: "Follow-up", get: () => "", width: 30 }], exceptions, { startRow: 4 });

  /* GL population ------------------------------------------------------ */
  if (lines.length <= 300000) {
    const gl = wb.addWorksheet("GL Population");
    title(gl, `${ref(8)} Journal entry population (as imported)`, `${pop.fileName} · SHA-256 ${pop.sha256}`);
    table(gl, [
      { label: "Source row", key: "source_row", width: 9 }, { label: "JE ID", key: "journal_id", width: 14 }, { label: "Line", key: "line_id", width: 7 }, { label: "Posting date", key: "posting_date", width: 12 },
      { label: "Effective date", key: "effective_date", width: 12 }, { label: "Account", key: "account", width: 28 }, { label: "Debit", key: "debit", money: true, width: 14 }, { label: "Credit", key: "credit", money: true, width: 14 },
      { label: "Description", key: "description", width: 34 }, { label: "Preparer", key: "preparer", width: 14 }, { label: "Approver", key: "approver", width: 14 }, { label: "Entry time", key: "entry_time", width: 10 },
      { label: "Source", key: "source", width: 12 }, { label: "Approval", key: "approval_status", width: 11 },
    ], lines, { startRow: 4 });
  }

  /* Methodology -------------------------------------------------------- */
  const me = wb.addWorksheet("Methodology");
  title(me, `${ref(9)} Methodology and settings`, "");
  const mrows = Object.entries(FLAGS).map(([k, f]) => ({ a: f.label, b: s.enabled[k] === false ? "Off" : s.weights[k], c: f.why }));
  mrows.push({ a: "Business hours", b: `${s.afterHoursEnd}:00–${s.afterHoursStart}:00`, c: "Entries outside these hours are after-hours." });
  mrows.push({ a: "Large value percentile", b: s.largePercentile, c: ctx.largeCut ? `Cut-off ${(ctx.largeCut / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : "Requires ≥10 entries" });
  mrows.push({ a: "Round amount unit", b: s.roundUnitCents / 100, c: "" }, { a: "Period-end window (days)", b: s.yearEndDays, c: "" }, { a: "Backdating threshold (days)", b: s.backdateDays, c: "Effective date earlier than posting date by more than this." });
  mrows.push({ a: "Seldom-used account: max entries", b: s.seldomAccountMax, c: `Frequency rules apply when the population has ≥ ${s.minPopulationForFrequency} entries.` }, { a: "Infrequent preparer: max entries", b: s.infrequentPreparerMax, c: "" });
  mrows.push({ a: "Vague description keywords", b: s.vagueKeywords.join(", "), c: "" }, { a: "Manual source values", b: s.manualSources.join(", "), c: "" });
  mrows.push({ a: "Benford first-digit test", b: benford ? `${benford.conformity} (MAD ${benford.mad.toFixed(4)}, n=${benford.n})` : "", c: "Nigrini MAD thresholds: <0.006 close, <0.012 acceptable, <0.015 marginal." });
  table(me, [{ label: "Rule / setting", key: "a", width: 34 }, { label: "Weight / value", key: "b", width: 30, wrap: true }, { label: "Description", key: "c", width: 80, wrap: true }], mrows, { startRow: 4, filter: false });

  /* Voucher images (embedded thumbnails) ------------------------------- */
  const imgs = vRows.filter((d) => /^image\/(png|jpeg)$/.test(d.mime || ""));
  if (imgs.length && readFile) {
    const im = wb.addWorksheet("Voucher Images");
    title(im, `${ref(10)} Voucher images`, "Embedded copies of image vouchers for review convenience.");
    im.getColumn(1).width = 14; im.getColumn(2).width = 14; im.getColumn(3).width = 90;
    let row = 4;
    for (const d of imgs.slice(0, 60)) {
      const blob = await readFile(d.path);
      if (!blob || blob.size > 4 * 1024 * 1024) continue;
      const buf = await blob.arrayBuffer();
      const dims = await imageSize(blob);
      const k = Math.min(1, 620 / (dims.w || 620), 380 / (dims.h || 380));
      const id = wb.addImage({ buffer: buf, extension: d.mime === "image/png" ? "png" : "jpeg" });
      im.getCell(`A${row}`).value = d.ref; im.getCell(`B${row}`).value = d.je; im.getCell(`A${row}`).font = { bold: true };
      im.addImage(id, { tl: { col: 2, row: row - 1 }, ext: { width: Math.round((dims.w || 620) * k), height: Math.round((dims.h || 380) * k) } });
      row += Math.ceil(((dims.h || 380) * k) / 20) + 2;
    }
  }
  return await wb.xlsx.writeBuffer();
}

function countBy(arr, key) { const m = {}; for (const a of arr) m[a[key]] = (m[a[key]] || 0) + 1; return Object.entries(m).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ") || "none"; }
function vouchSummary(sample, vouching) { const c = { done: 0, exc: 0 }; for (const x of sample) { const v = vouching[x.journal_id]; if (v?.conclusion) c.done++; if (v?.conclusion === "Exception") c.exc++; } return `${c.done} of ${sample.length} tested; ${c.exc} exception(s)`; }
function pct(a, b) { return b ? `${((a / b) * 100).toFixed(1)}%` : "—"; }
async function imageSize(blob) {
  try { if (typeof createImageBitmap === "function") { const b = await createImageBitmap(blob); const r = { w: b.width, h: b.height }; b.close?.(); return r; } } catch { /* fall through */ }
  return { w: 620, h: 380 };
}
