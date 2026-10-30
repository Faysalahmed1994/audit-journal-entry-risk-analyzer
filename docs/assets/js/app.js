/* AuditJE web app controller. All processing is local to the browser. */
import * as E from "./engine.js";
import { readTable, sha256Hex } from "./io.js";
import { Store, supportsFolders, safeName, download, FOLDERS } from "./store.js";
import { buildWorkpaper } from "./workpaper.js";
import { columns, benfordChart } from "./charts.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (c) => E.fmtCents(c);
const money0 = (c) => E.fmtCents(c, { noCents: true });
const nowStamp = () => new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
const today = () => new Date().toISOString().slice(0, 10);
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v; };

const STEPS = [
  { id: "engagement", ref: "JE.0", name: "Engagement", sub: "Client, period, team" },
  { id: "population", ref: "JE.1", name: "Population", sub: "Import the JE listing" },
  { id: "completeness", ref: "JE.2", name: "Completeness", sub: "Totals, TB roll-forward, gaps" },
  { id: "risk", ref: "JE.3", name: "Risk analysis", sub: "Fraud-risk characteristics" },
  { id: "sample", ref: "JE.4", name: "Sample selection", sub: "Key items, risk, random" },
  { id: "vouch", ref: "JE.5", name: "Vouching", sub: "Attach and test support" },
  { id: "workpaper", ref: "JE.6", name: "Workpaper", sub: "Conclude, sign off, export" },
];
const ATTRS = [
  ["supported", "Supported by documentation", "A voucher, invoice, contract or approval supports the entry."],
  ["amount", "Amount agrees", "Voucher amount agrees to the journal entry."],
  ["period", "Recorded in the correct period", "Service/transaction date belongs to the period recorded."],
  ["classification", "Account classification is appropriate", "Accounts debited and credited reflect the substance."],
  ["authorized", "Properly authorized", "Approval by someone other than the preparer, per policy."],
  ["purpose", "Business purpose is reasonable", "The entry has a clear, legitimate rationale."],
];
const DOC_TYPES = ["Invoice", "Receipt", "Contract / agreement", "Board minutes / resolution", "Bank statement", "Payroll register", "Grant agreement", "Approval email", "Calculation / schedule", "Other"];

const store = new Store();
let S = null;              // persisted engagement state
const R = {};              // runtime (derived) state
let step = "engagement";

function freshState() {
  return {
    app: "AuditJE", version: E.VERSION, createdAt: new Date().toISOString(), updatedAt: "",
    engagement: { client: "", engagementName: "", wpRef: "JE", preparedBy: "", preparedOn: "", reviewedBy: "", reviewedOn: "", conclusion: "" },
    settings: E.defaultSettings(), population: null, tb: null,
    controls: { lines: "", entries: "", debits: "", credits: "" },
    sampleParams: { size: 25, riskPercent: 60, seed: Math.floor(Math.random() * 90000) + 10000, keyItems: true, selectedAt: "" },
    sample: [], overrides: [], vouching: {}, voucherSeq: 0, current: "",
  };
}

/* ------------------------------------------------------------- persistence */
let saveTimer = null;
function persist(now = false) {
  if (!S) return;
  S.updatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  setSave("saving");
  saveTimer = setTimeout(async () => {
    try { await store.saveState(S); setSave(store.isFolder ? "saved" : "session"); }
    catch (e) { console.error(e); setSave("error", e.message); }
  }, now ? 0 : 500);
}
function setSave(state, msg) {
  const el = $("#saveState"); el.hidden = !S; el.dataset.state = state;
  $("#saveText").textContent = state === "saving" ? "Saving…" : state === "error" ? `Not saved: ${msg}` : state === "session" ? "This tab only — not saved to a folder" : `Saved to “${store.folderName}” ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/* ------------------------------------------------------------------ toasts */
let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), bad ? 6500 : 3200);
}
function ask(title, label, value = "") {
  const d = $("#askDlg"); $("#askTitle").textContent = title; $("#askLabel").textContent = label; $("#askText").value = value;
  return new Promise((res) => { d.onclose = () => res(d.returnValue === "ok" ? $("#askText").value.trim() : null); d.showModal(); $("#askText").focus(); });
}

/* ---------------------------------------------------------------- analysis */
async function bufferOf(fileOrBlob) { return await fileOrBlob.arrayBuffer(); }
function runAnalysis() {
  if (!R.table || !S.population) return;
  const t0 = performance.now();
  R.norm = E.normalize(R.table.rows, S.population.mapping, { dateOrder: S.settings.dateOrder });
  R.an = E.analyze(R.norm.lines, S.settings);
  R.byId = new Map(R.an.entries.map((e) => [e.journal_id, e]));
  R.exceptions = R.norm.exceptions.concat(R.an.entryExceptions);
  R.comp = E.completeness(R.norm.lines, R.an.entries, R.an.settings, S.controls, R.tb?.rows || null);
  R.benford = E.benford(R.an.entries);
  R.linesByJe = new Map();
  for (const l of R.norm.lines) { if (!R.linesByJe.has(l.journal_id)) R.linesByJe.set(l.journal_id, []); R.linesByJe.get(l.journal_id).push(l); }
  R.ms = Math.round(performance.now() - t0);
}
function rerunCompleteness() { if (R.an) R.comp = E.completeness(R.norm.lines, R.an.entries, R.an.settings, S.controls, R.tb?.rows || null); }
const ready = () => Boolean(R.an);

/* -------------------------------------------------------------- lifecycle */
async function startNew() {
  if (!supportsFolders()) return startSession();
  try { await store.pickFolder(); } catch (e) { if (e.name !== "AbortError") toast(e.message, true); return; }
  const existing = await store.loadState().catch(() => null);
  if (existing) { toast("This folder already has an engagement — opening it."); return openFromState(existing); }
  S = freshState(); clearRuntime(); persist(true); go("engagement");
}
async function openFolder(handle) {
  try { if (handle) await store.attach(handle); else await store.pickFolder(); } catch (e) { if (e.name !== "AbortError") toast(e.message, true); return; }
  const st = await store.loadState().catch(() => null);
  if (!st) { toast("No engagement.json in that folder. Choose “Start a new engagement” to set one up there.", true); return; }
  await openFromState(st);
}
async function openFromState(st) {
  S = Object.assign(freshState(), st);
  S.settings = { ...E.defaultSettings(), ...st.settings, weights: { ...E.defaultSettings().weights, ...(st.settings?.weights || {}) }, enabled: { ...E.defaultSettings().enabled, ...(st.settings?.enabled || {}) } };
  clearRuntime();
  try {
    if (S.population?.savedPath) {
      const f = await store.read(S.population.savedPath);
      if (!f) throw new Error(`Population file ${S.population.savedPath} is missing from the folder.`);
      const buf = await bufferOf(f);
      const hash = await sha256Hex(buf);
      if (hash !== S.population.sha256) toast("Warning: the saved population file has changed since import (hash differs).", true);
      R.table = await readTable(S.population.fileName, buf, window.ExcelJS, S.population.sheet);
    }
    if (S.tb?.savedPath) { const f = await store.read(S.tb.savedPath); if (f) { const t = await readTable(S.tb.fileName, await bufferOf(f), window.ExcelJS); R.tb = E.normalizeTB(t.rows, S.tb.mapping); } }
    runAnalysis();
  } catch (e) { toast(e.message, true); }
  setSave(store.isFolder ? "saved" : "session");
  go(S.current && stepEnabled(S.current) ? S.current : ready() ? "risk" : "engagement");
}
function startSession() { store.useSession(); S = freshState(); clearRuntime(); persist(true); go("engagement"); }
function clearRuntime() { for (const k of Object.keys(R)) delete R[k]; for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); }

async function loadSample() {
  store.useSession(); S = freshState(); clearRuntime();
  Object.assign(S.engagement, { client: "Village of Maple Grove (synthetic)", engagementName: "FY2026 financial statement audit", wpRef: "JE", preparedBy: "Demo auditor" });
  Object.assign(S.settings, { periodStart: "2025-07-01", periodEnd: "2026-06-30", thresholdCents: 25000000 });
  const [je, tb] = await Promise.all(["synthetic_journal_entries.csv", "synthetic_trial_balance.csv"].map((n) => fetch(`./assets/sample/${n}`).then((r) => { if (!r.ok) throw new Error("Sample data is unavailable."); return r.blob(); })));
  await importPopulation(new File([je], "synthetic_journal_entries.csv", { type: "text/csv" }), true);
  S.controls.lines = String(R.norm.lines.length);
  await importTB(new File([tb], "synthetic_trial_balance.csv", { type: "text/csv" }));
  rerunCompleteness(); persist(true);
  toast("Sample engagement loaded — all data is synthetic.");
  go("completeness");
}

/* ------------------------------------------------------------------ render */
function stepEnabled(id) {
  if (!S) return false;
  if (id === "engagement") return true;
  if (id === "population") return Boolean(S.engagement.client && S.settings.periodStart && S.settings.periodEnd);
  if (["completeness", "risk", "sample", "workpaper"].includes(id)) return ready();
  if (id === "vouch") return ready() && S.sample.length > 0;
  return false;
}
function stepDone(id) {
  if (!S) return false;
  if (id === "engagement") return stepEnabled("population");
  if (id === "population") return ready();
  if (id === "completeness") return ready() && R.comp.checks.length > 1;
  if (id === "risk") return ready();
  if (id === "sample") return S.sample.length > 0;
  if (id === "vouch") return S.sample.length > 0 && S.sample.every((x) => S.vouching[x.journal_id]?.conclusion);
  if (id === "workpaper") return Boolean(S.lastExport);
  return false;
}
function go(id) {
  if (!stepEnabled(id)) id = "engagement";
  step = id; S.current = id; persist();
  renderShell(); renderStep(); window.scrollTo(0, 0);
}
function renderCtx() {
  const ctx = $("#ctx");
  if (!S) { ctx.innerHTML = ""; return; }
  ctx.innerHTML = `<strong>${h(S.engagement.client || "New engagement")}</strong><span>${S.settings.periodStart ? `${h(S.settings.periodStart)} to ${h(S.settings.periodEnd)}` : "Period not set"}${store.isFolder ? ` · folder “${h(store.folderName)}”` : ""}</span>`;
}
function renderShell() {
  renderCtx();
  $("#app").innerHTML = `<div class="layout"><nav class="rail" aria-label="Workpaper steps"><h2>Workpaper index</h2><ol class="tabs">${STEPS.map((s) => `<li><button class="tab" data-go="${s.id}" ${s.id === step ? 'aria-current="page"' : ""} ${stepEnabled(s.id) ? "" : "disabled"}><span class="ref">${s.ref}</span><span class="name">${s.name}<small>${s.sub}</small></span><span class="tick" aria-label="${stepDone(s.id) ? "complete" : ""}">${stepDone(s.id) ? "✓" : ""}</span></button></li>`).join("")}</ol>
  <p class="privacy">${store.isFolder ? `Files are saved in <strong>${h(store.folderName)}</strong> on this computer.` : "Working in this browser tab only. Export the workpaper before closing."} Nothing is uploaded — AuditJE runs entirely in your browser.</p></nav><main class="main" id="main"><div class="page" id="page"></div></main></div>`;
}
function head(id, lede, actions = "") {
  const s = STEPS.find((x) => x.id === id);
  return `<div class="page-head"><span class="wpref">${h((S.engagement.wpRef || "JE") + s.ref.slice(2))}</span><div><h2>${s.name}</h2><p class="lede">${lede}</p></div><div class="actions">${actions}</div></div>`;
}
function renderStep() { const page = $("#page"); if (!page) return; page.innerHTML = VIEWS[step](); AFTER[step]?.(page); }

/* ----------------------------------------------------------------- views */
const fld = (label, bind, { type = "text", hint = "", attrs = "" } = {}) => `<label class="field"><span>${label}</span><input type="${type}" data-bind="${bind}" value="${h(getPath(S, bind) ?? "")}" ${attrs}>${hint ? `<small>${hint}</small>` : ""}</label>`;
const dollars = (c) => (c ? (c / 100).toFixed(2) : "");

const VIEWS = {
  engagement: () => `${head("engagement", "Who and what you are auditing. These details label the workpaper and drive period-based tests.", stepEnabled("population") ? `<button class="btn" data-go="population">Continue to population</button>` : "")}
    <div class="grid2">
      <div class="panel"><h3>Engagement</h3><div style="display:grid;gap:12px;margin-top:12px">
        ${fld("Client / entity", "engagement.client", { attrs: 'required placeholder="e.g., Village of Maple Grove"' })}
        ${fld("Engagement", "engagement.engagementName", { attrs: 'placeholder="e.g., FY2026 financial statement audit"' })}
        <div class="grid2">${fld("Period start", "settings.periodStart", { type: "date" })}${fld("Period end", "settings.periodEnd", { type: "date" })}</div>
        ${fld("Workpaper reference prefix", "engagement.wpRef", { hint: "Used for the index, e.g. JE → JE.1, JE.2 … or F-200." })}
      </div></div>
      <div class="panel"><h3>Team</h3><div style="display:grid;gap:12px;margin-top:12px">
        <div class="grid2">${fld("Prepared by", "engagement.preparedBy")}${fld("Date prepared", "engagement.preparedOn", { type: "date" })}</div>
        <div class="grid2">${fld("Reviewed by", "engagement.reviewedBy")}${fld("Date reviewed", "engagement.reviewedOn", { type: "date" })}</div>
        <label class="field"><span>Auditor threshold for key items (optional)</span><input type="number" min="0" step="0.01" data-money="thresholdCents" value="${dollars(S.settings.thresholdCents)}" placeholder="e.g., performance materiality"><small>Entries at or above this amount are flagged and can be selected as key items.</small></label>
      </div></div>
    </div>
    <div class="section"><div class="notice ${store.isFolder ? "good" : "warn"}">${store.isFolder ? `Saving to the folder <strong>${h(store.folderName)}</strong>: the population goes to <strong>${FOLDERS.population}</strong>, vouchers to <strong>${FOLDERS.vouchers}</strong>, workpapers to <strong>${FOLDERS.workpapers}</strong>, and your progress to <strong>engagement.json</strong>. Reopen the folder any time to continue.` : `This engagement lives in this browser tab only. ${supportsFolders() ? "" : "Saving to a folder needs Chrome or Edge on a computer. "}Export your workpaper before closing the tab.`}</div></div>
    ${stepEnabled("population") ? "" : `<p class="muted section">Enter the client and the period start and end to continue.</p>`}`,

  population: () => {
    const p = S.population;
    const pend = R.pending;
    return `${head("population", "Import the complete journal entry listing for the period, exported directly from the accounting system. A copy is saved to the engagement folder with a SHA-256 hash so the tested population can be evidenced later.", ready() ? `<button class="btn" data-go="completeness">Continue to completeness</button>` : "")}
    ${p && !pend ? `<div class="figures"><div class="figure"><b>${R.norm.lines.length.toLocaleString()}</b><span>lines imported</span></div><div class="figure"><b>${R.an.entries.length.toLocaleString()}</b><span>journal entries</span></div><div class="figure"><b>${money0(R.comp.totals.debit)}</b><span>total debits</span></div><div class="figure ${R.exceptions.length ? "alert" : ""}"><b>${R.exceptions.length}</b><span>data quality indicators</span></div></div>
      <div class="section panel tint"><div class="row" style="justify-content:space-between"><div><h3>${h(p.fileName)}</h3><p class="small muted">Saved as ${h(p.savedPath)} · imported ${h(p.importedAt)} · ${(p.size / 1024).toFixed(0)} KB</p><p class="small muted" style="word-break:break-all">SHA-256 ${h(p.sha256)}</p></div><button class="btn secondary" data-action="replace-pop">Replace population</button></div></div>
      ${R.exceptions.length ? `<div class="section"><h3>Data quality indicators</h3><p class="muted small" style="margin-bottom:8px">Each needs follow-up with the client. They are indicators, not conclusive errors.</p>${exceptionTable()}</div>` : `<div class="section notice good">No data quality indicators were found.</div>`}`
      : pend ? mappingView(pend) : dropzone("pop", "Drop the journal entry file here", "CSV or Excel (.xlsx) · one entity and period per import · stays on this computer")}`;
  },

  completeness: () => {
    const c = R.comp;
    const pass = c.checks.filter((x) => x.pass).length;
    return `${head("completeness", "Before relying on the population, show it is complete: agree totals to independent reports, roll the trial balance forward, confirm period coverage and look for missing journal numbers.", `<button class="btn" data-go="risk">Continue to risk analysis</button>`)}
    <div class="grid2">
      <div class="panel"><h3>Independent control totals</h3><p class="small muted" style="margin:4px 0 12px">From a system report you obtained yourself (e.g., GL detail totals), not from the extract.</p>
        <div class="grid2">${ctl("Line count", "lines")}${ctl("Journal entry count", "entries")}${ctl("Total debits", "debits")}${ctl("Total credits", "credits")}</div></div>
      <div class="panel"><h3>Trial balance roll-forward</h3><p class="small muted" style="margin:4px 0 12px">Import a TB with beginning and ending balances (Dr +, Cr −) to test that beginning + JE activity = ending for every account.</p>
        ${S.tb ? `<div class="row" style="justify-content:space-between"><div><strong>${h(S.tb.fileName)}</strong><p class="small muted">${R.tb?.rows.length || 0} accounts${R.tb?.errors?.length ? ` · ${R.tb.errors.length} unreadable row(s)` : ""}</p></div><button class="btn secondary" data-action="replace-tb">Replace TB</button></div>` : R.pendingTB ? tbMapping() : dropzone("tb", "Drop the trial balance here", "CSV or .xlsx with account, beginning and ending balance", true)}</div>
    </div>
    <div class="section"><h3>Results <span class="chip">${pass} of ${c.checks.length} agree</span></h3>
      <div class="tablewrap"><table><thead><tr><th>Procedure</th><th class="num">Expected</th><th class="num">Population</th><th class="num">Difference</th><th>Result</th><th>Detail</th></tr></thead><tbody>
      ${c.checks.map((x) => `<tr class="${x.pass ? "" : "fail"}"><td class="wrap">${h(x.check)}</td><td class="num">${x.money ? money(x.expected) : h(x.expected)}</td><td class="num">${x.money ? money(x.actual) : h(x.actual?.toLocaleString?.() ?? x.actual)}</td><td class="num">${x.difference === null ? "" : x.money ? money(x.difference) : h(x.difference)}</td><td class="mark ${x.pass ? "pass-mark" : "fail-mark"}">${x.pass ? "✓" : "✗"}</td><td class="small">${h(x.note || "")}</td></tr>`).join("")}
      </tbody></table></div></div>
    <div class="grid2 section">
      <div><h3>Entries by month</h3><p class="small muted">${h(c.coverage.first)} to ${h(c.coverage.last)}${c.coverage.undated ? ` · ${c.coverage.undated} undated line(s)` : ""}</p>${columns(c.coverage.months, { label: (m) => m.month.slice(2).replace("-", "/"), value: (m) => m.entries, hot: (m) => m.entries === 0, title: "Journal entries per month" })}</div>
      <div><h3>Journal number gaps</h3>${c.gaps.length ? `<p class="small muted" style="margin-bottom:8px">${c.gapCount} missing number(s). Ask the client to explain each range (voided, deleted, or posted to another ledger).</p><div class="tablewrap" style="max-height:220px"><table><thead><tr><th>From</th><th>To</th><th class="num">Missing</th></tr></thead><tbody>${c.gaps.map((g) => `<tr><td>${h(g.from)}</td><td>${h(g.to)}</td><td class="num">${g.count}</td></tr>`).join("")}</tbody></table></div>` : `<p class="notice good">No gaps found in sequential journal numbers.</p>`}</div>
    </div>
    ${c.rollforward ? `<div class="section"><h3>Roll-forward by account ${c.rollforward.failing ? `<span class="chip" style="color:var(--pencil)">${c.rollforward.failing} not rolling</span>` : `<span class="chip">all accounts roll</span>`}</h3>
      <div class="tablewrap"><table><thead><tr><th>Account</th><th class="num">Beginning</th><th class="num">JE activity</th><th class="num">Ending per TB</th><th class="num">Difference</th><th></th></tr></thead><tbody>
      ${[...c.rollforward.rows].sort((a, b) => a.pass - b.pass).map((r) => `<tr class="${r.pass ? "" : "fail"}"><td>${h(r.account)} ${h(r.account_name)}</td><td class="num">${money(r.beginning)}</td><td class="num">${money(r.activity)}</td><td class="num">${money(r.ending)}</td><td class="num">${money(r.difference)}</td><td class="mark ${r.pass ? "pass-mark" : "fail-mark"}">${r.pass ? "✓" : "✗"}</td></tr>`).join("")}
      ${c.rollforward.unmatched.map((u) => `<tr class="fail"><td>${h(u.account)} <span class="chip">not on TB</span></td><td></td><td class="num">${money(u.activity)}</td><td></td><td class="num">${money(u.activity)}</td><td class="mark fail-mark">✗</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}`;
  },

  risk: () => {
    const en = R.an.entries;
    const counts = { High: 0, Medium: 0, Low: 0 };
    en.forEach((e) => counts[e.tier]++);
    const flagged = en.filter((e) => e.score > 0).length;
    const fc = Object.keys(E.FLAGS).map((k) => ({ k, n: en.filter((e) => e.flagKeys.includes(k)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    const maxN = Math.max(1, ...fc.map((x) => x.n));
    const hours = Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: 0 }));
    let anyHour = false;
    for (const [, g] of R.linesByJe) { const hr = g.find((l) => l.hour !== null)?.hour; if (hr !== undefined && hr !== null) { hours[hr].value++; anyHour = true; } }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => ({ label, value: 0 }));
    for (const e of en) if (e.posting_date) days[E.weekday(e.posting_date)].value++;
    const s = S.settings;
    return `${head("risk", "Every entry is scored against fraud-risk characteristics from AU-C 240 and AS 2401. Scores are transparent heuristics to focus your selection, not evidence of fraud.", `<button class="btn" data-go="sample">Continue to sample selection</button>`)}
    <div class="figures"><div class="figure"><b>${en.length.toLocaleString()}</b><span>journal entries</span></div><div class="figure alert"><b>${counts.High}</b><span>high risk (score ≥ ${s.highScore})</span></div><div class="figure"><b>${counts.Medium}</b><span>medium risk</span></div><div class="figure"><b>${counts.Low}</b><span>low risk</span></div><div class="figure"><b>${((flagged / Math.max(1, en.length)) * 100).toFixed(0)}%</b><span>entries with at least one flag</span></div></div>
    <div class="grid2 section">
      <div><h3>What was flagged</h3><p class="small muted" style="margin-bottom:10px">Select a characteristic to filter the register.</p><div class="flagbars">${fc.map((x) => `<button data-flagfilter="${x.k}" aria-pressed="${R.flagFilter === x.k}" title="${h(E.FLAGS[x.k].why)}"><span>${h(E.FLAGS[x.k].label)}</span><i style="width:${(x.n / maxN) * 100}%"></i><span class="num">${x.n}</span></button>`).join("") || `<p class="muted">No entries were flagged.</p>`}</div></div>
      <div><h3>First-digit test (Benford's law)</h3><p class="small muted">${h(R.benford.conformity)} · MAD ${R.benford.mad.toFixed(4)} · ${R.benford.n} entries ≥ $10</p>${benfordChart(R.benford)}<div class="legend"><span><i style="background:var(--ink)"></i>Actual</span><span><i style="background:var(--pencil)"></i>Benford expected</span></div></div>
    </div>
    <div class="grid2 section">
      <div><h3>Entries by day posted</h3><p class="small muted">Red bars are weekend postings.</p>${columns(days, { height: 190, hot: (d) => d.label === "Sat" || d.label === "Sun", title: "Entries by weekday" })}</div>
      ${anyHour ? `<div><h3>Entries by hour entered</h3><p class="small muted">Red bars fall outside business hours (${s.afterHoursEnd}:00–${s.afterHoursStart}:00).</p>${columns(hours, { height: 190, hot: (d) => +d.label >= s.afterHoursStart || +d.label < s.afterHoursEnd, title: "Entries by hour" })}</div>` : `<div><h3>Entries by hour entered</h3><p class="muted small">Map an entry time column to see when entries were keyed.</p></div>`}
    </div>
    <div class="section panel tint"><details class="rules"><summary>Rules, weights and thresholds</summary>
      <div class="rulegrid">${Object.entries(E.FLAGS).map(([k, f]) => `<label class="rule" title="${h(f.why)}"><input type="checkbox" data-rule-on="${k}" ${s.enabled[k] !== false ? "checked" : ""}><span>${h(f.label)}</span><input type="number" min="0" max="100" data-rule-w="${k}" value="${s.weights[k]}" aria-label="Weight for ${h(f.label)}"></label>`).join("")}</div>
      <div class="grid3" style="margin-top:16px">
        ${num("High risk at score ≥", "highScore")}${num("Medium risk at score ≥", "mediumScore")}${num("Large value percentile", "largePercentile")}
        ${num("Business hours start", "afterHoursEnd")}${num("Business hours end", "afterHoursStart")}${num("Period-end window (days)", "yearEndDays")}
        <label class="field"><span>Round amount unit ($)</span><input type="number" min="0" data-money="roundUnitCents" value="${dollars(s.roundUnitCents)}"></label>
        ${num("Backdating threshold (days)", "backdateDays")}${num("Seldom-used account: ≤ entries", "seldomAccountMax")}
        ${num("Infrequent preparer: ≤ entries", "infrequentPreparerMax")}
        <label class="field"><span>Date order in file</span><select data-set="dateOrder"><option value="MDY" ${s.dateOrder === "MDY" ? "selected" : ""}>Month/Day/Year</option><option value="DMY" ${s.dateOrder === "DMY" ? "selected" : ""}>Day/Month/Year</option></select></label>
      </div>
      <div class="grid2" style="margin-top:16px"><label class="field"><span>Vague description keywords</span><textarea data-list="vagueKeywords">${h(s.vagueKeywords.join(", "))}</textarea></label><label class="field"><span>Values that mean a manual entry (source column)</span><textarea data-list="manualSources">${h(s.manualSources.join(", "))}</textarea></label></div>
      <div class="row" style="margin-top:12px"><button class="btn" data-action="apply-rules">Apply rules</button><button class="btn ghost" data-action="reset-rules">Reset to defaults</button><span class="small muted">Scored ${en.length.toLocaleString()} entries in ${R.ms} ms.</span></div>
    </details></div>
    <div class="section"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3>Risk register</h3><div class="row regtools">
      <input type="search" id="regSearch" placeholder="Search JE, account, preparer, description" value="${h(R.search || "")}" style="width:300px" aria-label="Search the register">
      <select id="regTier" aria-label="Filter by tier"><option value="">All tiers</option>${["High", "Medium", "Low"].map((t) => `<option ${R.tier === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      ${R.flagFilter ? `<button class="btn ghost" data-action="clear-flag">${h(E.FLAGS[R.flagFilter].label)} ✕</button>` : ""}</div></div>
      <div id="register"></div></div>`;
  },

  sample: () => {
    const p = S.sampleParams; const en = R.an.entries;
    const sel = S.sample; const selIds = new Set(sel.map((x) => x.journal_id));
    const total = en.reduce((a, e) => a + e.magnitude, 0); const selAmt = sel.reduce((a, x) => a + (R.byId.get(x.journal_id)?.magnitude || 0), 0);
    const high = en.filter((e) => e.tier === "High"); const highSel = high.filter((e) => selIds.has(e.journal_id)).length;
    const keyCount = S.settings.thresholdCents ? en.filter((e) => e.magnitude >= S.settings.thresholdCents).length : 0;
    return `${head("sample", "Select entries in three layers: key items above your threshold, the highest-risk entries, then a seeded random selection from the rest so unflagged entries also have a chance of selection.", sel.length ? `<button class="btn" data-go="vouch">Continue to vouching</button>` : "")}
    <div class="panel tint"><div class="grid3">
      <label class="field"><span>Sample size</span><input type="number" min="1" max="5000" data-bind="sampleParams.size" value="${p.size}"></label>
      <label class="field"><span>Risk-based share of remaining slots (%)</span><input type="number" min="0" max="100" data-bind="sampleParams.riskPercent" value="${p.riskPercent}"></label>
      <label class="field"><span>Random seed</span><input type="number" data-bind="sampleParams.seed" value="${p.seed}"><small>Recorded so a reviewer can re-perform the selection.</small></label>
    </div>
    <label class="row" style="margin-top:12px"><input type="checkbox" data-bind="sampleParams.keyItems" ${p.keyItems ? "checked" : ""} ${S.settings.thresholdCents ? "" : "disabled"}> <span>Select every key item ≥ ${S.settings.thresholdCents ? money0(S.settings.thresholdCents) : "threshold (set one on the Engagement step)"}${keyCount ? ` — ${keyCount} entr${keyCount === 1 ? "y" : "ies"}, added on top of the sample size if needed` : ""}</span></label>
    <div class="row" style="margin-top:14px"><button class="btn" data-action="select">${sel.length ? "Re-select sample" : "Select sample"}</button>${sel.length ? `<button class="btn secondary" data-action="add-je">Add an entry</button>` : ""}<span class="small muted">${p.selectedAt ? `Selected ${h(p.selectedAt)}` : ""}</span></div></div>
    ${sel.length ? `<div class="figures section"><div class="figure"><b>${sel.length}</b><span>entries selected</span></div><div class="figure"><b>${((selAmt / Math.max(1, total)) * 100).toFixed(1)}%</b><span>of population amount</span></div><div class="figure"><b>${highSel} / ${high.length}</b><span>high-risk entries covered</span></div><div class="figure"><b>${["Key item", "Risk-based", "Random", "Auditor added"].map((b) => sel.filter((x) => x.basis === b).length).join(" · ")}</b><span>key · risk · random · added</span></div></div>
    ${high.length > highSel ? `<p class="notice warn section">${high.length - highSel} high-risk entr${high.length - highSel === 1 ? "y is" : "ies are"} not in the sample. Consider increasing the size or risk share, or document why they need no testing.</p>` : ""}
    <div class="section tablewrap"><table><thead><tr><th>#</th><th>JE ID</th><th>Date</th><th class="num">Amount</th><th>Score</th><th>Basis</th><th>Why selected</th><th></th></tr></thead><tbody>
      ${sel.map((x, i) => { const e = R.byId.get(x.journal_id); return `<tr><td>${i + 1}</td><td><button class="btn ghost" data-je="${h(x.journal_id)}">${h(x.journal_id)}</button></td><td>${h(e?.posting_date)}</td><td class="num">${money(e?.magnitude)}</td><td>${e ? scoreCell(e) : ""}</td><td><span class="chip">${h(x.basis)}</span></td><td class="small">${h(x.reason)}</td><td><button class="btn ghost" data-remove="${h(x.journal_id)}" aria-label="Remove ${h(x.journal_id)} from sample">Remove</button></td></tr>`; }).join("")}
    </tbody></table></div>
    ${S.overrides.length ? `<div class="section"><h3>Changes to the selection</h3><div class="tablewrap" style="max-height:260px"><table><thead><tr><th>When</th><th>Action</th><th>JE</th><th>Reason</th><th>By</th></tr></thead><tbody>${S.overrides.map((o) => `<tr><td class="small">${h(o.at)}</td><td>${h(o.action)}</td><td>${h(o.journal_id)}</td><td class="small">${h(o.reason)}</td><td>${h(o.by)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}` : `<p class="muted section">No sample yet. Set the parameters and select.</p>`}`;
  },

  vouch: () => {
    if (!S.sample.find((x) => x.journal_id === R.vouchJe)) R.vouchJe = (S.sample.find((x) => !S.vouching[x.journal_id]?.conclusion) || S.sample[0]).journal_id;
    const done = S.sample.filter((x) => S.vouching[x.journal_id]?.conclusion).length;
    const exc = S.sample.filter((x) => S.vouching[x.journal_id]?.conclusion === "Exception").length;
    return `${head("vouch", "For each selected entry, attach the supporting documents and record what you tested. Files are saved to the voucher folder and referenced V-001, V-002… in the workpaper.", `<span class="chip">${done} of ${S.sample.length} tested · ${exc} exception${exc === 1 ? "" : "s"}</span>${done ? `<button class="btn" data-go="workpaper">Continue to workpaper</button>` : ""}`)}
    <div class="vouch"><nav class="queue" aria-label="Selected entries">${S.sample.map((x) => { const v = S.vouching[x.journal_id]; const st = v?.conclusion === "Exception" ? ["exc", "✗"] : v?.conclusion ? ["done", "✓"] : v?.vouchers?.length || v?.notes ? ["wip", "•"] : ["todo", "○"]; const e = R.byId.get(x.journal_id); return `<button data-vj="${h(x.journal_id)}" aria-current="${x.journal_id === R.vouchJe}"><span class="st ${st[0]}">${st[1]}</span><span><strong>${h(x.journal_id)}</strong><small>${h(x.basis)} · ${h(e?.posting_date)}</small></span><span class="num small">${money0(e?.magnitude)}</span></button>`; }).join("")}</nav>
    <div id="vouchDetail">${vouchDetail(R.vouchJe)}</div></div>`;
  },

  workpaper: () => {
    const done = S.sample.filter((x) => S.vouching[x.journal_id]?.conclusion).length;
    const exc = S.sample.filter((x) => S.vouching[x.journal_id]?.conclusion === "Exception");
    const fails = R.comp.checks.filter((c) => !c.pass);
    return `${head("workpaper", "Document your conclusion and sign-offs, then generate the Excel workpaper. It includes completeness, the risk register, the sample with vouching results and links to every voucher file.", "")}
    <div class="figures"><div class="figure"><b>${R.comp.checks.length - fails.length} / ${R.comp.checks.length}</b><span>completeness procedures agree</span></div><div class="figure"><b>${S.sample.length}</b><span>entries selected</span></div><div class="figure"><b>${done}</b><span>tested</span></div><div class="figure ${exc.length ? "alert" : ""}"><b>${exc.length}</b><span>exceptions</span></div></div>
    ${done < S.sample.length ? `<p class="notice warn section">${S.sample.length - done} selected entr${S.sample.length - done === 1 ? "y has" : "ies have"} no conclusion yet. You can still export a draft.</p>` : ""}
    ${fails.length ? `<p class="notice bad section">Open completeness items: ${fails.map((f) => h(f.check)).join("; ")}. Document how each was resolved in the conclusion.</p>` : ""}
    ${exc.length ? `<div class="section"><h3>Exceptions</h3><ul>${exc.map((x) => `<li><strong>${h(x.journal_id)}</strong>: ${h(S.vouching[x.journal_id].exceptionDetail || "No detail recorded")}</li>`).join("")}</ul></div>` : ""}
    <div class="grid2 section"><div class="panel"><h3>Conclusion</h3><label class="field" style="margin-top:10px"><span class="sr">Conclusion</span><textarea data-bind="engagement.conclusion" rows="7" placeholder="e.g., Based on the procedures performed, the journal entry population is complete and no evidence of management override was identified, except …">${h(S.engagement.conclusion)}</textarea></label></div>
    <div class="panel"><h3>Sign-off</h3><div style="display:grid;gap:12px;margin-top:10px"><div class="grid2">${fld("Prepared by", "engagement.preparedBy")}${fld("Date", "engagement.preparedOn", { type: "date" })}</div><div class="grid2">${fld("Reviewed by", "engagement.reviewedBy")}${fld("Date", "engagement.reviewedOn", { type: "date" })}</div></div></div></div>
    <div class="section row"><button class="btn big" data-action="export">${store.isFolder ? `Save workpaper to ${FOLDERS.workpapers}` : "Download workpaper (.xlsx)"}</button>${store.isFolder ? `<button class="btn secondary big" data-action="export-dl">Download a copy</button>` : ""}</div>
    ${S.lastExport ? `<p class="small muted section">Last generated ${h(S.lastExport.at)}${S.lastExport.path ? ` → ${h(S.lastExport.path)}` : ""}</p>` : ""}`;
  },
};

/* ------------------------------------------------------------ view helpers */
function dropzone(kind, title, sub, compact = false) {
  return `<div class="drop" data-drop="${kind}" tabindex="0" role="button" aria-label="${h(title)} or press Enter to browse" style="${compact ? "padding:20px" : "padding:56px"}"><strong>${h(title)}</strong><span class="muted small">${h(sub)}</span><span class="btn secondary">Browse files</span><input type="file" hidden accept=".csv,.xlsx,.xlsm,.txt,.tsv" data-file="${kind}"></div>`;
}
function ctl(label, key) { return `<label class="field"><span>${label}</span><input type="text" inputmode="decimal" data-ctl="${key}" value="${h(S.controls[key] || "")}" placeholder="from system report"></label>`; }
function num(label, key) { return `<label class="field"><span>${label}</span><input type="number" data-set="${key}" value="${h(S.settings[key])}"></label>`; }
function scoreCell(e) { return `<span class="score"><i style="--w:${e.score}%"></i>${e.score}</span>`; }
function exceptionTable() {
  return `<div class="tablewrap" style="max-height:340px"><table><thead><tr><th>Source row</th><th>JE ID</th><th>Indicator</th><th>Detail</th></tr></thead><tbody>${R.exceptions.slice(0, 500).map((x) => `<tr><td>${h(x.row)}</td><td>${h(x.journal_id)}</td><td>${h(x.type)}</td><td class="small">${h(x.detail)}</td></tr>`).join("")}</tbody></table></div>${R.exceptions.length > 500 ? `<p class="small muted">Showing 500 of ${R.exceptions.length}; all are in the workpaper.</p>` : ""}`;
}
function mappingView(p) {
  const t = p.table; const m = p.mapping; const errs = E.mappingErrors(m);
  const first = t.rows[0] || {};
  return `<div class="panel tint"><div class="row" style="justify-content:space-between"><div><h3>${h(p.file.name)}</h3><p class="small muted">${t.rows.length.toLocaleString()} data rows · ${t.headers.length} columns${t.sheetNames.length > 1 ? ` · sheet` : ""}</p></div>
    <div class="row">${t.sheetNames.length > 1 ? `<select data-action-change="sheet" aria-label="Worksheet">${t.sheetNames.map((n) => `<option ${n === t.sheet ? "selected" : ""}>${h(n)}</option>`).join("")}</select>` : ""}<button class="btn ghost" data-action="cancel-pop">Choose another file</button></div></div></div>
    <div class="section"><h3>Match your columns</h3><p class="small muted" style="margin:4px 0 12px">We matched what we could. Check each field; required fields are marked.</p>
    <div class="tablewrap" style="max-height:none"><table><thead><tr><th>AuditJE field</th><th>Column in your file</th><th>First value</th></tr></thead><tbody>
    ${E.FIELDS.map((f) => `<tr><td><strong>${h(f.label)}</strong>${f.required ? ` <span class="chip">required</span>` : ""}</td><td><select data-map="${f.key}" aria-label="Column for ${h(f.label)}"><option value="">— not in file —</option>${t.headers.map((hd) => `<option ${m[f.key] === hd ? "selected" : ""}>${h(hd)}</option>`).join("")}</select></td><td class="small muted">${m[f.key] ? h(String(first[m[f.key]] instanceof Date ? first[m[f.key]].toISOString().slice(0, 10) : first[m[f.key]] ?? "").slice(0, 60)) : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="row section"><label class="field" style="width:240px"><span>Date order</span><select data-set-pending="dateOrder"><option value="MDY" ${S.settings.dateOrder === "MDY" ? "selected" : ""}>Month/Day/Year (US)</option><option value="DMY" ${S.settings.dateOrder === "DMY" ? "selected" : ""}>Day/Month/Year</option></select></label></div>
    ${errs.length ? `<p class="notice bad section">${errs.map(h).join("<br>")}</p>` : ""}
    <div class="row section"><button class="btn big" data-action="import-pop" ${errs.length ? "disabled" : ""}>Import population</button><span class="small muted">${store.isFolder ? `A copy will be saved to ${FOLDERS.population}.` : ""}</span></div></div>`;
}
function tbMapping() {
  const p = R.pendingTB; const errs = E.mappingErrors(p.mapping, E.TB_FIELDS);
  return `<p class="small"><strong>${h(p.file.name)}</strong> — match the columns:</p><div style="display:grid;gap:8px;margin:10px 0">${E.TB_FIELDS.map((f) => `<label class="field"><span>${h(f.label)}${f.required ? " *" : ""}</span><select data-tbmap="${f.key}"><option value="">—</option>${p.table.headers.map((hd) => `<option ${p.mapping[f.key] === hd ? "selected" : ""}>${h(hd)}</option>`).join("")}</select></label>`).join("")}</div>
  ${errs.length ? `<p class="notice bad">${errs.map(h).join("<br>")}</p>` : ""}<div class="row"><button class="btn" data-action="import-tb" ${errs.length ? "disabled" : ""}>Import TB</button><button class="btn ghost" data-action="cancel-tb">Cancel</button></div>`;
}

function renderRegister() {
  const el = $("#register"); if (!el) return;
  const q = (R.search || "").toLowerCase();
  let rows = R.an.entries;
  if (R.tier) rows = rows.filter((e) => e.tier === R.tier);
  if (R.flagFilter) rows = rows.filter((e) => e.flagKeys.includes(R.flagFilter));
  if (q) rows = rows.filter((e) => [e.journal_id, e.preparer, e.description, e.source, ...e.accounts].join(" ").toLowerCase().includes(q));
  const sort = R.sort || "score";
  const dir = R.sortDir || -1;
  const val = { score: (e) => e.score * 1e15 + e.magnitude, amount: (e) => e.magnitude, date: (e) => e.posting_date, je: (e) => e.journal_id };
  rows = [...rows].sort((a, b) => { const x = val[sort](a), y = val[sort](b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  const limit = R.limit || 200;
  const sel = new Set(S.sample.map((x) => x.journal_id));
  const th = (k, label, cls = "") => `<th class="${cls}"><button data-sort="${k}">${label}${sort === k ? (dir < 0 ? " ↓" : " ↑") : ""}</button></th>`;
  el.innerHTML = `<div class="tablewrap"><table><thead><tr>${th("je", "JE ID")}${th("date", "Posted")}${th("amount", "Amount", "num")}<th>Preparer</th><th>Description</th>${th("score", "Score")}<th>Tier</th><th>Flags</th></tr></thead><tbody>
    ${rows.slice(0, limit).map((e) => `<tr class="clickable ${sel.has(e.journal_id) ? "is-selected" : ""}" data-je="${h(e.journal_id)}" tabindex="0"><td><strong>${h(e.journal_id)}</strong></td><td>${h(e.posting_date)}</td><td class="num">${money(e.magnitude)}</td><td>${h(e.preparer)}</td><td class="small">${h(e.description.slice(0, 60))}</td><td>${scoreCell(e)}</td><td><span class="tier ${e.tier}">${e.tier}</span></td><td class="wrap">${e.flags.slice(0, 4).map((f) => `<span class="chip">${h(E.FLAGS[f.key].label)}</span>`).join("")}${e.flags.length > 4 ? `<span class="chip">+${e.flags.length - 4}</span>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No entries match these filters.</td></tr>`}
  </tbody></table></div><p class="small muted" style="margin-top:6px">Showing ${Math.min(limit, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} entries. Selected entries have a red marker. ${rows.length > limit ? `<button class="btn ghost" data-action="more">Show more</button>` : ""}</p>`;
}

/* ---------------------------------------------------------------- drawer */
function openDrawer(je) {
  const e = R.byId.get(je); if (!e) return;
  const lines = R.linesByJe.get(je) || [];
  const inSample = S.sample.find((x) => x.journal_id === je);
  const d = $("#drawer");
  d.innerHTML = `<header><div><h3 id="drawerTitle" style="font-size:20px">${h(je)}</h3><p class="small muted">${h(e.posting_date)} · ${e.lines} lines · ${h(e.preparer || "no preparer")}</p></div><span class="tier ${e.tier}" style="margin-left:auto">${e.tier} · ${e.score}</span><button class="btn ghost" data-close aria-label="Close">✕</button></header>
  <div class="body"><div class="figures"><div class="figure"><b>${money(e.debit)}</b><span>debits</span></div><div class="figure"><b>${money(e.credit)}</b><span>credits</span></div><div class="figure ${e.difference ? "alert" : ""}"><b>${money(e.difference)}</b><span>out of balance</span></div></div>
  <div><h3 style="margin-bottom:8px">Why it was flagged</h3><div class="flaglist">${e.flags.map((f) => `<div><b>${h(E.FLAGS[f.key].label)} <span class="small muted">+${S.settings.weights[f.key]}</span></b><span class="small">${h(E.FLAGS[f.key].why)}${f.detail ? ` — ${h(f.detail)}` : ""}</span></div>`).join("") || `<p class="muted">No risk characteristics.</p>`}</div></div>
  <div><h3 style="margin-bottom:8px">Lines</h3><div class="tablewrap"><table><thead><tr><th>Row</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th>Description</th><th>Time</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${l.source_row}</td><td>${h(l.account)}</td><td class="num">${l.debit ? money(l.debit) : ""}</td><td class="num">${l.credit ? money(l.credit) : ""}</td><td class="small">${h(l.description)}</td><td>${h(l.entry_time)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="row">${inSample ? `<span class="chip">In sample · ${h(inSample.basis)}</span><button class="btn" data-vouch-from-drawer="${h(je)}">Open in vouching</button>` : S.sample.length ? `<button class="btn" data-add-from-drawer="${h(je)}">Add to sample</button>` : `<span class="muted small">Select a sample to add entries manually.</span>`}</div></div>`;
  d.classList.add("open"); d.setAttribute("aria-hidden", "false"); $("#scrim").classList.add("open");
  $("[data-close]", d).focus();
}
function closeDrawer() { const d = $("#drawer"); d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("open"); }

/* ---------------------------------------------------------------- vouching */
const urlCache = new Map();
async function urlFor(path) { if (urlCache.has(path)) return urlCache.get(path); const f = await store.read(path); if (!f) return null; const u = URL.createObjectURL(f); urlCache.set(path, u); return u; }
function vrec(je) { return (S.vouching[je] ??= { attrs: {}, conclusion: "", exceptionDetail: "", notes: "", testedBy: "", testedOn: "", vouchers: [] }); }
function vouchDetail(je) {
  const e = R.byId.get(je); const x = S.sample.find((s) => s.journal_id === je); if (!e) return `<p class="notice bad">${h(je)} is no longer in the population.</p>`;
  const v = vrec(je); const chk = E.voucherCheck(e, v.vouchers);
  const lines = R.linesByJe.get(je) || [];
  const idx = S.sample.findIndex((s) => s.journal_id === je);
  return `<div class="panel"><div class="row" style="justify-content:space-between"><div><h3 style="font-size:20px">${h(je)} <span class="tier ${e.tier}">${e.tier} · ${e.score}</span></h3><p class="small muted">${h(e.posting_date)} · ${money(e.magnitude)} · ${h(x.basis)} · ${h(e.preparer || "no preparer")}</p></div><button class="btn ghost" data-je="${h(je)}">Entry details</button></div>
    <div style="margin-top:8px">${e.flags.map((f) => `<span class="chip" title="${h(f.detail || "")}">${h(E.FLAGS[f.key].label)}</span>`).join("")}</div>
    <div class="tablewrap" style="margin-top:12px;max-height:200px"><table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th>Description</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${h(l.account)}</td><td class="num">${l.debit ? money(l.debit) : ""}</td><td class="num">${l.credit ? money(l.credit) : ""}</td><td class="small">${h(l.description)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="section"><h3>Supporting documents</h3>
    <div class="drop" data-drop="voucher" tabindex="0" role="button" aria-label="Add voucher files" style="padding:18px;margin:10px 0 14px"><strong>Drop vouchers here or browse</strong><span class="small muted">PDF, images, Word, Excel or email files · saved to ${FOLDERS.vouchers}/${h(safeName(je))}</span><input type="file" hidden multiple data-file="voucher" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.heic,.doc,.docx,.xls,.xlsx,.csv,.msg,.eml,.txt"></div>
    <div class="vlist">${v.vouchers.map((d, i) => `<div class="voucher"><div class="pv" data-view="${i}" title="Open ${h(d.fileName)}"><span class="vref">${h(d.ref)}</span>${/^image\//.test(d.mime) ? `<img alt="${h(d.fileName)}" data-src="${h(d.path)}">` : `<span class="doc">${h((d.fileName.split(".").pop() || "file").toUpperCase())}</span>`}</div>
      <div class="meta"><div class="wide"><strong style="word-break:break-all">${h(d.fileName)}</strong><button class="btn ghost" data-vdel="${i}">Remove</button></div>
      <label class="field"><span>Document type</span><select data-vf="${i}.docType"><option value=""></option>${DOC_TYPES.map((t) => `<option ${d.docType === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="field"><span>Document no.</span><input type="text" data-vf="${i}.docNo" value="${h(d.docNo)}"></label>
      <label class="field"><span>Document date</span><input type="date" data-vf="${i}.docDate" value="${h(d.docDate)}"></label>
      <label class="field"><span>Vendor / payee</span><input type="text" data-vf="${i}.payee" value="${h(d.payee)}"></label>
      <label class="field"><span>Amount</span><input type="text" inputmode="decimal" data-vf="${i}.amount" value="${h(d.amount)}" placeholder="0.00"></label>
      <label class="field"><span>Saved as</span><input type="text" value="${h(d.path)}" readonly></label></div></div>`).join("") || `<p class="muted small">No documents attached yet.</p>`}</div>
    <p class="section" id="agreeLine">${agreeLine(chk)}</p></div>
  <div class="section"><h3 style="margin-bottom:10px">Attributes tested</h3><div class="attrs">${ATTRS.map(([k, label, hint]) => `<div class="attr"><p>${label}<small>${hint}</small></p><span class="seg" role="radiogroup" aria-label="${label}">${[["Yes", "✓", "y"], ["No", "✗", "n"], ["N/A", "N/A", "na"]].map(([val, txt, cls]) => `<label><input type="radio" name="a-${k}" value="${val}" data-attr="${k}" ${v.attrs[k] === val ? "checked" : ""}><span class="${cls}" aria-label="${val}">${txt}</span></label>`).join("")}</span></div>`).join("")}</div></div>
  <div class="section grid2"><label class="field"><span>Conclusion</span><select data-vc="conclusion"><option value="">Not concluded</option><option ${v.conclusion === "No exception" ? "selected" : ""}>No exception</option><option ${v.conclusion === "Exception" ? "selected" : ""}>Exception</option></select></label>
    <div class="grid2">${`<label class="field"><span>Tested by</span><input type="text" data-vc="testedBy" value="${h(v.testedBy || S.engagement.preparedBy)}"></label><label class="field"><span>Date tested</span><input type="date" data-vc="testedOn" value="${h(v.testedOn)}"></label>`}</div></div>
  ${v.conclusion === "Exception" || Object.values(v.attrs).includes("No") ? `<label class="field section"><span>Exception detail</span><textarea data-vc="exceptionDetail" placeholder="What differed, amount, client explanation, and whether it is a misstatement or control deficiency">${h(v.exceptionDetail)}</textarea></label>` : ""}
  <label class="field section"><span>Auditor notes</span><textarea data-vc="notes" placeholder="Procedures performed, who you spoke with, documents inspected">${h(v.notes)}</textarea></label>
  <div class="row section"><button class="btn" data-action="vouch-next">${idx < S.sample.length - 1 ? "Save and go to next entry" : "Save"}</button></div>`;
}
function agreeLine(chk) {
  if (chk.total === null) return `<span class="muted small">Enter voucher amounts to compare with the entry.</span>`;
  return `Voucher total <strong>${money(chk.total)}</strong> — ${chk.agrees ? `<span class="agree ok">✓ agrees to the entry</span>` : `<span class="agree bad">✗ differs by ${money(chk.difference)}</span>`}`;
}
async function hydrateVoucherImages(root) { for (const img of $$("img[data-src]", root)) { const u = await urlFor(img.dataset.src); if (u) img.src = u; } }
async function addVouchers(files) {
  const je = R.vouchJe; const v = vrec(je);
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) { toast(`${f.name} is larger than 50 MB and was skipped.`, true); continue; }
    const buf = await f.arrayBuffer();
    const ref = `V-${String(++S.voucherSeq).padStart(3, "0")}`;
    const path = await store.unique(`${FOLDERS.vouchers}/${safeName(je)}/${ref}_${safeName(f.name, 90)}`);
    try { await store.write(path, new Blob([buf], { type: f.type })); } catch (e) { toast(`Could not save ${f.name}: ${e.message}`, true); continue; }
    v.vouchers.push({ ref, fileName: f.name, path, mime: f.type || "", size: f.size, sha256: await sha256Hex(buf), addedAt: nowStamp(), docType: "", docNo: "", docDate: "", payee: "", amount: "" });
  }
  persist(); renderStep();
  toast(store.isFolder ? `Saved to ${FOLDERS.vouchers}/${safeName(je)}` : "Attached (this tab only)");
}
async function viewVoucher(i) {
  const d = vrec(R.vouchJe).vouchers[i]; const u = await urlFor(d.path);
  if (!u) return toast("The file is missing from the folder.", true);
  if (!/^image\/|application\/pdf/.test(d.mime)) { const a = Object.assign(document.createElement("a"), { href: u, download: d.fileName }); a.click(); return; }
  const el = document.createElement("div"); el.className = "viewer"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", d.fileName);
  el.innerHTML = `<header><strong>${h(d.ref)} · ${h(d.fileName)}</strong><button class="btn ghost" data-close-viewer>Close</button></header><div class="frame">${d.mime === "application/pdf" ? `<iframe src="${u}" title="${h(d.fileName)}"></iframe>` : `<img src="${u}" alt="${h(d.fileName)}">`}</div>`;
  const scrim = $("#scrim"); scrim.classList.add("open");
  const close = () => { el.remove(); scrim.classList.remove("open"); document.removeEventListener("keydown", esc); };
  const esc = (ev) => { if (ev.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  el.addEventListener("click", (ev) => { if (ev.target.closest("[data-close-viewer]")) close(); });
  scrim.onclick = close;
  document.body.appendChild(el); $("[data-close-viewer]", el).focus();
}

/* ---------------------------------------------------------- import actions */
async function receiveFile(kind, file) {
  try {
    const buf = await file.arrayBuffer();
    if (kind === "pop") {
      const table = await readTable(file.name, buf, window.ExcelJS);
      if (!table.rows.length) throw new Error("The file has a header row but no data rows.");
      if (table.rows.length > 1000000) throw new Error("More than 1,000,000 lines. Split the population by period or entity.");
      R.pending = { file, buf, table, mapping: E.autoMap(table.headers) };
    } else if (kind === "tb") {
      const table = await readTable(file.name, buf, window.ExcelJS);
      R.pendingTB = { file, buf, table, mapping: E.autoMap(table.headers, E.TB_FIELDS) };
    } else if (kind === "voucher") { return addVouchers([file]); }
    renderStep();
  } catch (e) { toast(e.message, true); }
}
async function importPopulation(file, silent = false) {
  if (!R.pending) { const buf = await file.arrayBuffer(); const table = await readTable(file.name, buf, window.ExcelJS); R.pending = { file, buf, table, mapping: E.autoMap(table.headers) }; }
  const p = R.pending;
  const errs = E.mappingErrors(p.mapping); if (errs.length) throw new Error(errs[0]);
  const hash = await sha256Hex(p.buf);
  const path = await store.unique(`${FOLDERS.population}/${safeName(p.file.name, 120)}`);
  await store.write(path, new Blob([p.buf]));
  const replaced = Boolean(S.population);
  S.population = { fileName: p.file.name, savedPath: path, sha256: hash, size: p.buf.byteLength, importedAt: nowStamp(), mapping: p.mapping, sheet: p.table.sheet, rows: p.table.rows.length };
  R.table = p.table; delete R.pending;
  if (replaced && S.sample.length) { S.overrides.push({ at: nowStamp(), action: "Population replaced — sample cleared", journal_id: "", reason: `New file ${p.file.name}`, by: S.engagement.preparedBy }); S.sample = []; S.sampleParams.selectedAt = ""; }
  runAnalysis(); persist(true);
  if (!silent) { toast(`Imported ${R.norm.lines.length.toLocaleString()} lines (${R.an.entries.length.toLocaleString()} entries).`); go("population"); }
}
async function importTB(file) {
  if (!R.pendingTB) { const buf = await file.arrayBuffer(); const table = await readTable(file.name, buf, window.ExcelJS); R.pendingTB = { file, buf, table, mapping: E.autoMap(table.headers, E.TB_FIELDS) }; }
  const p = R.pendingTB;
  const path = await store.unique(`${FOLDERS.population}/TB_${safeName(p.file.name, 110)}`);
  await store.write(path, new Blob([p.buf]));
  S.tb = { fileName: p.file.name, savedPath: path, sha256: await sha256Hex(p.buf), mapping: p.mapping, importedAt: nowStamp() };
  R.tb = E.normalizeTB(p.table.rows, p.mapping); delete R.pendingTB;
  if (R.tb.errors.length) toast(R.tb.errors[0], true);
  rerunCompleteness(); persist();
}

/* ----------------------------------------------------------------- sample */
function selectSample() {
  const p = S.sampleParams;
  S.sample = E.selectSample(R.an.entries, { size: p.size, riskPercent: p.riskPercent, seed: p.seed, keyItems: p.keyItems, thresholdCents: S.settings.thresholdCents });
  p.selectedAt = nowStamp();
  S.overrides.push({ at: p.selectedAt, action: "Sample selected", journal_id: "", reason: `Size ${p.size}, risk ${p.riskPercent}%, seed ${p.seed}${p.keyItems && S.settings.thresholdCents ? `, key items ≥ ${money0(S.settings.thresholdCents)}` : ""} → ${S.sample.length} entries`, by: S.engagement.preparedBy });
  persist(); renderShell(); renderStep();
}
async function addToSample(je) {
  if (!R.byId.has(je)) return toast(`${je} is not in the population.`, true);
  if (S.sample.some((x) => x.journal_id === je)) return toast(`${je} is already selected.`);
  const reason = await ask(`Add ${je} to the sample`, "Why are you adding this entry?"); if (!reason) return;
  S.sample.push({ journal_id: je, basis: "Auditor added", reason });
  S.overrides.push({ at: nowStamp(), action: "Added", journal_id: je, reason, by: S.engagement.preparedBy });
  persist(); renderShell(); renderStep(); toast(`${je} added to the sample.`);
}
async function removeFromSample(je) {
  const reason = await ask(`Remove ${je} from the sample`, "Why are you removing this entry? This is recorded in the workpaper."); if (!reason) return;
  S.sample = S.sample.filter((x) => x.journal_id !== je);
  S.overrides.push({ at: nowStamp(), action: "Removed", journal_id: je, reason, by: S.engagement.preparedBy });
  persist(); renderShell(); renderStep();
}

/* ----------------------------------------------------------------- export */
async function exportWorkpaper(forceDownload = false) {
  if (!window.ExcelJS) return toast("Excel support did not load. Reload the page and try again.", true);
  const btns = $$("[data-action^=export]"); btns.forEach((b) => (b.disabled = true));
  try {
    const buf = await buildWorkpaper(window.ExcelJS, {
      engagement: S.engagement, settings: R.an.settings, population: S.population, entries: R.an.entries, lines: R.norm.lines, exceptions: R.exceptions,
      comp: R.comp, benford: R.benford, sample: S.sample, vouching: S.vouching, overrides: S.overrides, sampleParams: S.sampleParams, largeCut: R.an.largeCut, folderMode: store.isFolder,
    }, (p) => store.read(p));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1_");
    const name = `${safeName(S.engagement.wpRef || "JE")}_JE_testing_${safeName(S.engagement.client || "client", 40)}_${stamp}.xlsx`;
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    let path = "";
    if (store.isFolder && !forceDownload) { path = `${FOLDERS.workpapers}/${name}`; await store.write(path, blob); toast(`Saved ${path}`); }
    else { download(blob, name); toast("Workpaper downloaded."); }
    S.lastExport = { at: nowStamp(), path }; persist(); renderShell(); renderStep();
  } catch (e) { console.error(e); toast(`Export failed: ${e.message}`, true); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

/* ------------------------------------------------------------------- home */
async function renderHome() {
  S = null; renderCtx(); $("#saveState").hidden = true;
  const recent = store.recentName();
  const can = supportsFolders();
  $("#app").innerHTML = `<section class="home">
    <div><h1>Journal entry testing, from population to vouched sample.</h1>
      <p class="lede">Import the JE listing, prove it is complete, score every entry against fraud-risk characteristics, select a defensible sample, attach vouchers and export a referenced Excel workpaper. Everything is saved in an engagement folder you choose.</p>
      <div class="ctas">${can ? `<button class="btn big" data-home="new">Start a new engagement</button><button class="btn secondary big" data-home="open">Open an engagement folder</button>` : `<button class="btn big" data-home="session">Start an engagement</button>`}</div>
      <p class="alt">${recent ? `<button class="linkbtn" data-home="recent">Reopen “${h(recent)}”</button> or ` : ""}<button class="linkbtn" data-home="sample">${recent ? "try" : "Or try"} the sample engagement</button> with synthetic data.</p>
      <p class="fine">${can ? "Your browser asks which folder AuditJE may use; files never leave this computer." : "Saving to a folder needs Chrome or Edge on a desktop. In this browser, work stays in the tab and you download the workpaper at the end."} AuditJE is a rules-based planning aid, not a fraud determination or a substitute for professional judgment.</p></div>
    <div class="ledger" aria-hidden="true"><header>JE.5 Vouching <span>✓ 4 / ✗ 1</span></header><table><tbody>
      ${[["JE-1405", "Reclass per CFO", "$250,000.00", "✗"], ["JE-1406", "Year-end accrual", "$180,000.00", "✓"], ["JE-1352", "Payroll period 21", "$196,412.88", "✓"], ["JE-1411", "Settlement", "$95,000.00", "✓"], ["JE-1288", "Vendor invoice 88412", "$18,750.00", "✓"]].map((r, i) => `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="t"><span class="tick-in" style="animation-delay:${0.5 + i * 0.28}s">${r[3]}</span></td></tr>`).join("")}
    </tbody></table><footer>Each voucher saved as 03_Vouchers/JE-1406/V-002_invoice.pdf and linked from the workpaper.</footer></div>
    <div class="how">${[["Completeness", "Control totals, TB roll-forward, period coverage and journal number gaps."], ["Risk analysis", "19 fraud-risk characteristics, Benford's law, adjustable weights."], ["Sample selection", "Key items, highest risk, then seeded random; every change logged."], ["Vouching", "Attach documents, test six attributes, record exceptions."]].map(([t, d]) => `<div><b>${t}</b><p>${d}</p></div>`).join("")}</div>
  </section>`;
  requestAnimationFrame(() => $(".ledger")?.classList.add("play"));
}

/* ----------------------------------------------------------------- events */
document.addEventListener("click", async (ev) => {
  const t = ev.target;
  const homeBtn = t.closest("[data-home]");
  if (homeBtn) {
    const a = homeBtn.dataset.home;
    if (a === "new") return startNew();
    if (a === "open") return openFolder();
    if (a === "recent") { const hnd = await store.recent(); return hnd ? openFolder(hnd) : openFolder(); }
    if (a === "session") return startSession();
    if (a === "sample") return loadSample().catch((e) => toast(e.message, true));
  }
  if (t.closest("#brandLink")) { ev.preventDefault(); if (S && !store.isFolder && !confirm("Leave this engagement? Work in this tab that has not been exported will be lost.")) return; closeDrawer(); return renderHome(); }
  if (!S) return;
  const goBtn = t.closest("[data-go]"); if (goBtn && !goBtn.disabled) { closeDrawer(); return go(goBtn.dataset.go); }
  if (t.closest("[data-close]") || t === $("#scrim")) return closeDrawer();
  const je = t.closest("[data-je]"); if (je) return openDrawer(je.dataset.je);
  const drop = t.closest("[data-drop]"); if (drop && !t.closest("input")) return $("input[type=file]", drop).click();
  const ff = t.closest("[data-flagfilter]"); if (ff) { R.flagFilter = R.flagFilter === ff.dataset.flagfilter ? "" : ff.dataset.flagfilter; R.limit = 200; return renderStep(); }
  const sortBtn = t.closest("[data-sort]"); if (sortBtn) { const k = sortBtn.dataset.sort; R.sortDir = R.sort === k ? -(R.sortDir || -1) : -1; R.sort = k; return renderRegister(); }
  const rm = t.closest("[data-remove]"); if (rm) return removeFromSample(rm.dataset.remove);
  const addD = t.closest("[data-add-from-drawer]"); if (addD) { closeDrawer(); return addToSample(addD.dataset.addFromDrawer); }
  const vd = t.closest("[data-vouch-from-drawer]"); if (vd) { R.vouchJe = vd.dataset.vouchFromDrawer; closeDrawer(); return go("vouch"); }
  const vj = t.closest("[data-vj]"); if (vj) { R.vouchJe = vj.dataset.vj; renderStep(); return; }
  const vv = t.closest("[data-view]"); if (vv) return viewVoucher(+vv.dataset.view);
  const vdel = t.closest("[data-vdel]"); if (vdel) { const v = vrec(R.vouchJe); const d = v.vouchers[+vdel.dataset.vdel]; if (!confirm(`Remove ${d.ref} (${d.fileName})? ${store.isFolder ? "The file will be deleted from the folder." : ""}`)) return; await store.remove(d.path); v.vouchers.splice(+vdel.dataset.vdel, 1); persist(); return renderStep(); }
  const act = t.closest("[data-action]")?.dataset.action;
  if (!act) return;
  try {
    switch (act) {
      case "import-pop": return await importPopulation(R.pending.file);
      case "cancel-pop": delete R.pending; return renderStep();
      case "replace-pop": if (S.sample.length && !confirm("Replacing the population clears the current sample. Vouching notes stay attached to journal IDs. Continue?")) return; delete R.pending; return showPopDrop();
      case "import-tb": await importTB(R.pendingTB.file); toast("Trial balance imported."); return renderStep();
      case "cancel-tb": delete R.pendingTB; return renderStep();
      case "replace-tb": S.tb = null; delete R.tb; rerunCompleteness(); persist(); return renderStep();
      case "apply-rules": runAnalysis(); persist(); toast("Rules applied — entries re-scored."); return renderStep();
      case "reset-rules": { const keep = { periodStart: S.settings.periodStart, periodEnd: S.settings.periodEnd, thresholdCents: S.settings.thresholdCents, dateOrder: S.settings.dateOrder }; S.settings = { ...E.defaultSettings(), ...keep }; runAnalysis(); persist(); return renderStep(); }
      case "clear-flag": R.flagFilter = ""; return renderStep();
      case "more": R.limit = (R.limit || 200) + 500; return renderRegister();
      case "select": if (S.sample.length && Object.keys(S.vouching).length && !confirm("Re-selecting replaces the current sample. Vouching already recorded stays attached to journal IDs and reappears if an entry is selected again. Continue?")) return; return selectSample();
      case "add-je": { const id = await ask("Add an entry to the sample", "Journal ID"); if (id) return addToSample(id.trim()); return; }
      case "vouch-next": { const v = vrec(R.vouchJe); if (v.conclusion && !v.testedOn) v.testedOn = today(); if (!v.testedBy) v.testedBy = S.engagement.preparedBy; persist(true); const i = S.sample.findIndex((x) => x.journal_id === R.vouchJe); const nxt = S.sample.slice(i + 1).find((x) => !S.vouching[x.journal_id]?.conclusion) || S.sample[i + 1]; if (nxt) R.vouchJe = nxt.journal_id; renderShell(); renderStep(); toast("Saved."); return; }
      case "export": return exportWorkpaper(false);
      case "export-dl": return exportWorkpaper(true);
    }
  } catch (e) { console.error(e); toast(e.message, true); }
});
function showPopDrop() { const page = $("#page"); page.innerHTML = head("population", "Choose the replacement population file.", `<button class="btn ghost" data-go="population">Cancel</button>`) + dropzone("pop", "Drop the replacement journal entry file here", "CSV or Excel (.xlsx)"); }

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && $("#drawer").classList.contains("open")) return closeDrawer();
  if (ev.key === "Enter" || ev.key === " ") {
    const drop = ev.target.closest?.("[data-drop]"); if (drop && ev.target === drop) { ev.preventDefault(); $("input[type=file]", drop).click(); }
    const row = ev.target.closest?.("tr[data-je]"); if (row && ev.target === row) { ev.preventDefault(); openDrawer(row.dataset.je); }
  }
});

document.addEventListener("change", async (ev) => {
  const t = ev.target; if (!S) return;
  if (t.matches("[data-file]")) { const files = [...t.files]; t.value = ""; if (t.dataset.file === "voucher") return addVouchers(files); return receiveFile(t.dataset.file, files[0]); }
  if (t.matches("[data-map]")) { R.pending.mapping[t.dataset.map] = t.value; return renderStep(); }
  if (t.matches("[data-tbmap]")) { R.pendingTB.mapping[t.dataset.tbmap] = t.value; return renderStep(); }
  if (t.matches("[data-action-change=sheet]")) { try { R.pending.table = await readTable(R.pending.file.name, R.pending.buf, window.ExcelJS, t.value); R.pending.mapping = E.autoMap(R.pending.table.headers); renderStep(); } catch (e) { toast(e.message, true); } return; }
  if (t.matches("[data-set-pending]")) { S.settings[t.dataset.setPending] = t.value; persist(); return; }
  if (t.matches("[data-set]")) { S.settings[t.dataset.set] = t.tagName === "SELECT" ? t.value : Number(t.value); persist(); return; }
  if (t.matches("[data-list]")) { S.settings[t.dataset.list] = t.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean); persist(); return; }
  if (t.matches("[data-rule-on]")) { S.settings.enabled[t.dataset.ruleOn] = t.checked; persist(); return; }
  if (t.matches("[data-rule-w]")) { S.settings.weights[t.dataset.ruleW] = Math.max(0, Math.min(100, Number(t.value) || 0)); persist(); return; }
  if (t.matches("[data-money]")) { const c = E.toCents(t.value); S.settings[t.dataset.money] = c && c > 0 ? c : 0; if (ready()) runAnalysis(); persist(); return; }
  if (t.matches("[data-ctl]")) { S.controls[t.dataset.ctl] = t.value.trim(); rerunCompleteness(); persist(); renderShell(); return renderStep(); }
  if (t.matches("[data-attr]")) { vrec(R.vouchJe).attrs[t.dataset.attr] = t.value; const v = vrec(R.vouchJe); if (t.value === "No" && !v.conclusion) v.conclusion = "Exception"; persist(); if (t.value === "No") renderStep(); return; }
  if (t.matches("[data-vc]")) { const v = vrec(R.vouchJe); v[t.dataset.vc] = t.value; if (t.dataset.vc === "conclusion") { if (t.value && !v.testedOn) v.testedOn = today(); if (!v.testedBy) v.testedBy = S.engagement.preparedBy; persist(); renderShell(); return renderStep(); } persist(); return; }
  if (t.matches("[data-bind]") && t.type === "checkbox") { setPath(S, t.dataset.bind, t.checked); persist(); return; }
  if (t.matches("[data-bind]") && (t.dataset.bind.startsWith("settings.period"))) { if (ready()) runAnalysis(); renderShell(); if (step === "engagement") renderStep(); }
  if (t.matches("#regTier")) { R.tier = t.value; R.limit = 200; return renderRegister(); }
});
document.addEventListener("input", (ev) => {
  const t = ev.target; if (!S) return;
  if (t.matches("[data-bind]") && t.type !== "checkbox") {
    const numeric = t.type === "number";
    setPath(S, t.dataset.bind, numeric ? Number(t.value) : t.value); persist();
    if (t.dataset.bind === "engagement.client") renderCtx();
    if (step === "engagement" && /client|period/.test(t.dataset.bind)) { const was = $(".tab[data-go=population]")?.disabled; if (was !== !stepEnabled("population")) { renderShell(); renderStep(); const again = $(`[data-bind="${t.dataset.bind}"]`); again?.focus(); } }
  }
  if (t.matches("[data-vf]")) { const [i, k] = t.dataset.vf.split("."); vrec(R.vouchJe).vouchers[+i][k] = t.value; persist(); if (k === "amount") { const e = R.byId.get(R.vouchJe); $("#agreeLine").innerHTML = agreeLine(E.voucherCheck(e, vrec(R.vouchJe).vouchers)); } }
  if (t.matches("[data-vc]") && t.tagName === "TEXTAREA") { vrec(R.vouchJe)[t.dataset.vc] = t.value; persist(); }
  if (t.matches("#regSearch")) { R.search = t.value; R.limit = 200; renderRegister(); }
});

// Drag and drop onto drop zones.
document.addEventListener("dragover", (ev) => { const d = ev.target.closest?.("[data-drop]"); if (d) { ev.preventDefault(); d.classList.add("over"); } else if (ev.dataTransfer?.types?.includes("Files")) ev.preventDefault(); });
document.addEventListener("dragleave", (ev) => { const d = ev.target.closest?.("[data-drop]"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", (ev) => {
  const d = ev.target.closest?.("[data-drop]"); ev.preventDefault(); if (!d || !S) return; d.classList.remove("over");
  const files = [...(ev.dataTransfer?.files || [])]; if (!files.length) return;
  if (d.dataset.drop === "voucher") return addVouchers(files);
  return receiveFile(d.dataset.drop, files[0]);
});

const AFTER = {
  risk: () => renderRegister(),
  vouch: (page) => { hydrateVoucherImages(page); $(".queue [aria-current=true]")?.scrollIntoView({ block: "nearest" }); },
};

/* ------------------------------------------------------------------ theme */
function applyTheme(t) { document.documentElement.dataset.theme = t; $("#themeBtn").textContent = t === "dark" ? "Light" : "Dark"; try { localStorage.setItem("auditje-theme", t); } catch { /* storage unavailable */ } }
$("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
let savedTheme = null; try { savedTheme = localStorage.getItem("auditje-theme"); } catch { /* ignore */ }
applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

window.addEventListener("beforeunload", (ev) => { if (S && (!store.isFolder || saveTimer && $("#saveState").dataset.state === "saving")) { ev.preventDefault(); ev.returnValue = ""; } });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

renderHome();
// Test hook (used only by automated browser tests; exposes no data externally).
window.__auditje = { get state() { return S; }, get runtime() { return R; }, store };
