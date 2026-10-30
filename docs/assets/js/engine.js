/*
 * AuditJE analysis engine — pure functions, no DOM, no network.
 * Amounts are handled as integer cents to avoid floating-point drift.
 * Results are audit planning aids, not conclusions about fraud or assurance.
 */
export const VERSION = "0.2.0";

/* ----------------------------------------------------------------- fields */
export const FIELDS = [
  { key: "journal_id", label: "Journal ID", required: true, aliases: ["journal id", "journal number", "je number", "je no", "je id", "je", "entry no", "entry number", "journal no", "journal", "document number", "doc no", "voucher no", "transaction id"] },
  { key: "line_id", label: "Line ID", aliases: ["line number", "line no", "line id", "line", "row id", "seq", "sequence"] },
  { key: "posting_date", label: "Posting date", required: true, aliases: ["posting date", "post date", "posted date", "date posted", "gl date", "transaction date", "je date", "entry date", "date"] },
  { key: "effective_date", label: "Effective / document date", aliases: ["effective date", "document date", "doc date", "accounting date", "period date", "value date"] },
  { key: "account", label: "GL account", required: true, aliases: ["account number", "account no", "account code", "account", "gl account", "gl code", "gl account number", "acct", "acct no", "account id"] },
  { key: "account_name", label: "Account name", aliases: ["account name", "account description", "gl account name", "acct name", "account title"] },
  { key: "debit", label: "Debit", aliases: ["debits", "dr", "debit amount", "dr amount", "debit"] },
  { key: "credit", label: "Credit", aliases: ["credits", "cr", "credit amount", "cr amount", "credit"] },
  { key: "amount", label: "Signed amount (Dr +, Cr −)", aliases: ["amount", "net amount", "signed amount", "transaction amount", "value", "amount (signed)"] },
  { key: "description", label: "Description", aliases: ["memo", "narrative", "explanation", "journal description", "line description", "description", "comment", "reference"] },
  { key: "preparer", label: "Prepared / entered by", aliases: ["created by", "entered by", "user", "user id", "prepared by", "preparer", "posted by", "creator"] },
  { key: "approver", label: "Approved by", aliases: ["approved by", "approver", "reviewed by", "authorized by", "authoriser", "authorizer"] },
  { key: "entry_time", label: "Entry time", aliases: ["created time", "time entered", "posted time", "posting time", "entry time", "time", "created at", "timestamp", "created date time"] },
  { key: "source", label: "Source / entry type", aliases: ["entry source", "journal source", "entry type", "origin", "source", "je type", "journal type", "module"] },
  { key: "approval_status", label: "Approval status", aliases: ["approval", "approved", "review status", "approval status", "status"] },
];

export const TB_FIELDS = [
  { key: "account", label: "GL account", required: true, aliases: ["account", "account number", "account no", "account code", "gl account", "gl code", "acct"] },
  { key: "account_name", label: "Account name", aliases: ["account name", "account description", "description", "name"] },
  { key: "beginning", label: "Beginning balance (Dr +, Cr −)", required: true, aliases: ["beginning balance", "opening balance", "beginning", "begin bal", "beg bal", "prior year", "py balance", "opening", "balance beginning"] },
  { key: "ending", label: "Ending balance (Dr +, Cr −)", required: true, aliases: ["ending balance", "closing balance", "ending", "end bal", "current year", "cy balance", "closing", "balance ending", "final balance"] },
];

const keyOf = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function autoMap(headers, fields = FIELDS) {
  const mapping = {};
  const used = new Set();
  // Pass 1: exact canonical/alias matches in field order (more specific first).
  for (const f of fields) {
    const wanted = [f.key, ...f.aliases].map(keyOf);
    for (const w of wanted) {
      const hit = headers.find((h) => !used.has(h) && keyOf(h) === w);
      if (hit !== undefined) { mapping[f.key] = hit; used.add(hit); break; }
    }
  }
  // A dedicated debit/credit pair beats a generic "amount" column.
  if (mapping.debit && mapping.credit && mapping.amount) delete mapping.amount;
  return mapping;
}

export function mappingErrors(mapping, fields = FIELDS) {
  const errors = [];
  for (const f of fields) if (f.required && !mapping[f.key]) errors.push(`Map a column to “${f.label}”.`);
  if (fields === FIELDS) {
    const pair = mapping.debit && mapping.credit;
    if (!pair && !mapping.amount) errors.push("Map Debit and Credit columns, or one signed Amount column.");
    if ((mapping.debit && !mapping.credit) || (!mapping.debit && mapping.credit)) errors.push("Debit and Credit must both be mapped (or use one signed Amount column).");
  }
  const chosen = Object.values(mapping).filter(Boolean);
  const dup = chosen.find((h, i) => chosen.indexOf(h) !== i);
  if (dup) errors.push(`Column “${dup}” is mapped to more than one field.`);
  return errors;
}

/* ---------------------------------------------------------------- parsing */
/** Returns integer cents, 0 for blank, or null when the text is not a number. */
export function toCents(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = String(v).trim();
  if (!s || s === "-" || s === "—") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const suffix = s.match(/\s*(cr|dr)\.?$/i);
  if (suffix) { if (suffix[1].toLowerCase() === "cr") neg = !neg; s = s.slice(0, suffix.index); }
  if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
  s = s.replace(/[$€£,\s]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n, w = 2) => String(n).padStart(w, "0");
function iso(y, m, d) {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse many common ledger date formats into YYYY-MM-DD (or null). order: "MDY" | "DMY". */
export function parseDate(v, order = "MDY") {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return parseDate(d); }
    if (v > 19000101 && v < 21001231) return iso(Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100);
    return null;
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:$|\s)/))) return order === "DMY" ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{2,4})/))) { const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]; return mo ? iso(+m[3], mo, +m[1]) : null; }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/))) { const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()]; return mo ? iso(+m[3], mo, +m[2]) : null; }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return iso(+m[1], +m[2], +m[3]);
  return null;
}

/** Hour of day (0-23) from a time, datetime string, Date, or Excel time fraction. */
export function parseHour(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v.getUTCHours();
  if (typeof v === "number") { if (v < 0) return null; const frac = v - Math.floor(v); return Math.floor(frac * 24 + 1e-9) % 24; }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AaPp]\.?[Mm]\.?)?/);
  if (!m) return null;
  let h = +m[1];
  if (h > 23) return null;
  if (m[3]) { const pm = /p/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h;
}

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const weekday = (isoDate) => new Date(isoDate + "T00:00:00Z").getUTCDay();
export const accountKey = (a) => text(a).toUpperCase();
export const accountCode = (a) => (text(a).match(/^[A-Za-z0-9][A-Za-z0-9.\-]*/) || [""])[0].toUpperCase();

/** Convert raw source rows into normalized GL lines plus line-level data-quality exceptions. */
export function normalize(rawRows, mapping, opts = {}) {
  const order = opts.dateOrder || "MDY";
  const lines = [];
  const exceptions = [];
  const seenLine = new Set();
  const exactLine = new Set();
  const get = (row, f) => (mapping[f] ? row[mapping[f]] : undefined);
  rawRows.forEach((row, i) => {
    const sourceRow = row.__row || i + 2;
    const ex = (type, detail, je) => exceptions.push({ row: sourceRow, journal_id: je ?? "", type, detail });
    let je = text(get(row, "journal_id"));
    if (!je) { ex("Missing journal ID", "Journal number not populated; line treated as its own entry"); je = `[NO-ID-ROW-${sourceRow}]`; }
    const rawDate = get(row, "posting_date");
    const posting = parseDate(rawDate, order);
    if (!posting) ex("Missing/invalid posting date", text(rawDate) || "(blank)", je);
    const effRaw = get(row, "effective_date");
    const effective = mapping.effective_date ? parseDate(effRaw, order) : null;
    if (mapping.effective_date && text(effRaw) && !effective) ex("Invalid effective date", text(effRaw), je);
    let debit = 0, credit = 0;
    if (mapping.debit && mapping.credit) {
      const d = toCents(get(row, "debit")), c = toCents(get(row, "credit"));
      if (d === null) ex("Invalid debit amount", text(get(row, "debit")), je);
      if (c === null) ex("Invalid credit amount", text(get(row, "credit")), je);
      debit = d || 0; credit = c || 0;
      if (debit < 0 || credit < 0) ex("Negative debit/credit", "Review sign conventions in the source extract", je);
      if (debit !== 0 && credit !== 0) ex("Both debit and credit", "One line has both debit and credit populated", je);
    } else {
      const a = toCents(get(row, "amount"));
      if (a === null) ex("Invalid amount", text(get(row, "amount")), je);
      if (a > 0) debit = a; else if (a < 0) credit = -a;
    }
    const account = text(get(row, "account"));
    if (!account) ex("Missing account", "GL account not populated", je);
    const lineId = text(get(row, "line_id"));
    if (lineId) { const k = je + "\u0000" + lineId; if (seenLine.has(k)) ex("Duplicate line ID", `Line ID ${lineId}`, je); seenLine.add(k); }
    const description = text(get(row, "description"));
    const fp = [je, posting, account, debit, credit, description].join("\u0000");
    const duplicate = exactLine.has(fp);
    if (duplicate) ex("Exact duplicate line", "Same JE, date, account, amount and description as an earlier line", je);
    exactLine.add(fp);
    const timeRaw = get(row, "entry_time");
    const hour = parseHour(timeRaw);
    if (mapping.entry_time && text(timeRaw) && hour === null && !(timeRaw instanceof Date)) ex("Unreadable entry time", text(timeRaw), je);
    lines.push({
      source_row: sourceRow, journal_id: je, line_id: lineId, posting_date: posting || "", effective_date: effective || "",
      account, account_name: text(get(row, "account_name")), debit, credit, description,
      preparer: text(get(row, "preparer")), approver: text(get(row, "approver")), entry_time: text(timeRaw instanceof Date ? timeRaw.toISOString().slice(11, 19) : timeRaw), hour,
      source: text(get(row, "source")), approval_status: text(get(row, "approval_status")), duplicate,
    });
  });
  return { lines, exceptions };
}

export function normalizeTB(rawRows, mapping) {
  const rows = [];
  const errors = [];
  rawRows.forEach((row, i) => {
    const account = text(row[mapping.account]);
    if (!account) return;
    const b = toCents(row[mapping.beginning]), e = toCents(row[mapping.ending]);
    if (b === null || e === null) { errors.push(`TB row ${row.__row || i + 2}: invalid balance for ${account}`); return; }
    rows.push({ account, account_name: mapping.account_name ? text(row[mapping.account_name]) : "", beginning: b, ending: e });
  });
  return { rows, errors };
}

/* ------------------------------------------------------------ rules/flags */
export const DEFAULT_KEYWORDS = ["adj", "adjust", "adjustment", "adjusting", "plug", "reclass", "correction", "misc", "miscellaneous", "per cfo", "per ceo", "per controller", "per mgmt", "top side", "topside", "override", "tbd", "n/a", "various", "suspense"];

export const FLAGS = {
  UNBALANCED: { label: "Unbalanced entry", weight: 35, why: "Entry debits and credits differ by more than the tolerance." },
  WEEKEND: { label: "Weekend posting", weight: 15, why: "Posting date falls on a Saturday or Sunday." },
  AFTER_HOURS: { label: "After-hours entry", weight: 15, why: "Entry time is outside the configured business hours." },
  LARGE: { label: "Large value", weight: 20, why: "Entry amount is at or above the configured percentile of the population." },
  ABOVE_THRESHOLD: { label: "Above auditor threshold", weight: 25, why: "Entry amount is at or above the auditor-defined threshold (e.g., performance materiality)." },
  ROUND: { label: "Round amount", weight: 10, why: "Entry amount is a round multiple of the configured unit." },
  MANUAL: { label: "Manual source", weight: 15, why: "Source/entry type indicates a manual, spreadsheet or top-side entry." },
  YEAR_END: { label: "Near period end", weight: 15, why: "Posted within the final days of the period." },
  POST_CLOSE: { label: "Posted after period end", weight: 25, why: "Posting date is after period end (post-closing entry)." },
  BEFORE_PERIOD: { label: "Dated before period", weight: 15, why: "Posting date is before the period start." },
  BACKDATED: { label: "Backdated entry", weight: 20, why: "Effective/document date is much earlier than the posting date." },
  MISSING_PREPARER: { label: "Missing preparer", weight: 10, why: "No preparer is recorded on any line." },
  NOT_APPROVED: { label: "Not approved", weight: 20, why: "Approval status is pending, rejected or unapproved." },
  SELF_APPROVED: { label: "Self-approved", weight: 20, why: "The approver is the same person as the preparer." },
  DUP_LINE: { label: "Duplicate line", weight: 20, why: "A line exactly repeats another line in the same entry." },
  DUP_ENTRY: { label: "Possible duplicate entry", weight: 20, why: "Another entry (different JE ID) has identical accounts and amounts." },
  SELDOM_ACCOUNT: { label: "Seldom-used account", weight: 15, why: "Uses an account that appears in very few entries in the population." },
  UNUSUAL_USER: { label: "Infrequent preparer", weight: 15, why: "Prepared by a user who rarely posts journal entries." },
  VAGUE: { label: "Vague/no description", weight: 10, why: "Description is blank, very short, or uses words like adj, plug, reclass, per CFO." },
};

export function defaultSettings() {
  return {
    periodStart: "", periodEnd: "", dateOrder: "MDY",
    toleranceCents: 1,
    yearEndDays: 5, afterHoursStart: 19, afterHoursEnd: 7,
    largePercentile: 90, thresholdCents: 0, roundUnitCents: 100000,
    backdateDays: 30, minPopulationForFrequency: 30, seldomAccountMax: 2, infrequentPreparerMax: 2,
    manualSources: ["manual", "manual je", "spreadsheet", "excel", "topside", "top-side", "gj", "general journal", "adjusting"],
    notApprovedStatuses: ["not approved", "rejected", "pending", "unapproved", "draft", "open"],
    vagueKeywords: DEFAULT_KEYWORDS.slice(),
    weights: Object.fromEntries(Object.entries(FLAGS).map(([k, f]) => [k, f.weight])),
    enabled: Object.fromEntries(Object.keys(FLAGS).map((k) => [k, true])),
    highScore: 50, mediumScore: 20,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)];
}

/* --------------------------------------------------------------- analysis */
export function analyze(lines, settingsIn = {}) {
  const s = { ...defaultSettings(), ...settingsIn };
  s.weights = { ...defaultSettings().weights, ...(settingsIn.weights || {}) };
  s.enabled = { ...defaultSettings().enabled, ...(settingsIn.enabled || {}) };
  const groups = new Map();
  for (const l of lines) { if (!groups.has(l.journal_id)) groups.set(l.journal_id, []); groups.get(l.journal_id).push(l); }

  // Population frequency measures (for seldom-used accounts and infrequent preparers).
  const accountJEs = new Map(), preparerJEs = new Map(), signatures = new Map();
  for (const [je, g] of groups) {
    for (const a of new Set(g.map((l) => accountKey(l.account)).filter(Boolean))) accountJEs.set(a, (accountJEs.get(a) || 0) + 1);
    for (const p of new Set(g.map((l) => l.preparer.toLowerCase()).filter(Boolean))) preparerJEs.set(p, (preparerJEs.get(p) || 0) + 1);
    const sig = g.map((l) => `${accountKey(l.account)}|${l.debit}|${l.credit}`).sort().join(";");
    if (!signatures.has(sig)) signatures.set(sig, []);
    signatures.get(sig).push(je);
  }
  const enoughForFrequency = groups.size >= s.minPopulationForFrequency;
  const magnitudes = [];
  for (const g of groups.values()) magnitudes.push(Math.max(g.reduce((a, l) => a + l.debit, 0), g.reduce((a, l) => a + l.credit, 0)));
  magnitudes.sort((a, b) => a - b);
  const largeCut = groups.size >= 10 ? percentile(magnitudes, s.largePercentile) : Infinity;
  const manual = new Set(s.manualSources.map((x) => x.toLowerCase().trim()));
  const notApproved = new Set(s.notApprovedStatuses.map((x) => x.toLowerCase().trim()));
  const kw = s.vagueKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  const kwRe = kw.length ? new RegExp(`(^|[^a-z])(${kw.map((k) => k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})([^a-z]|$)`, "i") : null;
  const periodEndMinus = s.periodEnd ? new Date(Date.parse(s.periodEnd) - (s.yearEndDays - 1) * 86400000).toISOString().slice(0, 10) : "";

  const entryExceptions = [];
  const entries = [];
  for (const [je, g] of groups) {
    const debit = g.reduce((a, l) => a + l.debit, 0), credit = g.reduce((a, l) => a + l.credit, 0);
    const magnitude = Math.max(debit, credit);
    const dates = g.map((l) => l.posting_date).filter(Boolean).sort();
    const flags = [];
    const add = (k, detail) => { if (s.enabled[k] !== false && !flags.some((f) => f.key === k)) flags.push({ key: k, detail }); };
    if (Math.abs(debit - credit) > s.toleranceCents) { add("UNBALANCED", `Dr ${fmtCents(debit)} vs Cr ${fmtCents(credit)}`); entryExceptions.push({ row: "", journal_id: je, type: "Unbalanced entry", detail: `Dr ${fmtCents(debit)} vs Cr ${fmtCents(credit)}` }); }
    const wk = dates.find((d) => [0, 6].includes(weekday(d)));
    if (wk) add("WEEKEND", `${wk} (${["Sun", "", "", "", "", "", "Sat"][weekday(wk)]})`);
    const late = g.find((l) => l.hour !== null && (l.hour >= s.afterHoursStart || l.hour < s.afterHoursEnd));
    if (late) add("AFTER_HOURS", `Entered ${late.entry_time}`);
    if (magnitude >= largeCut && magnitude > 0) add("LARGE", `≥ ${s.largePercentile}th percentile (${fmtCents(largeCut)})`);
    if (s.thresholdCents > 0 && magnitude >= s.thresholdCents) add("ABOVE_THRESHOLD", `≥ ${fmtCents(s.thresholdCents)}`);
    if (s.roundUnitCents > 0 && magnitude >= s.roundUnitCents && magnitude % s.roundUnitCents === 0) add("ROUND", fmtCents(magnitude));
    const man = g.find((l) => manual.has(l.source.toLowerCase()));
    if (man) add("MANUAL", man.source);
    if (s.periodEnd) {
      const ye = dates.find((d) => d >= periodEndMinus && d <= s.periodEnd);
      if (ye) add("YEAR_END", ye);
      const pc = dates.find((d) => d > s.periodEnd);
      if (pc) add("POST_CLOSE", `${pc} (${daysBetween(s.periodEnd, pc)} days after period end)`);
    }
    if (s.periodStart) { const bp = dates.find((d) => d < s.periodStart); if (bp) add("BEFORE_PERIOD", bp); }
    const bd = g.find((l) => l.effective_date && l.posting_date && daysBetween(l.effective_date, l.posting_date) > s.backdateDays);
    if (bd) add("BACKDATED", `Effective ${bd.effective_date}, posted ${bd.posting_date}`);
    if (g.every((l) => !l.preparer)) add("MISSING_PREPARER", "No preparer on any line");
    const na = g.find((l) => notApproved.has(l.approval_status.toLowerCase()));
    if (na) add("NOT_APPROVED", na.approval_status);
    const sa = g.find((l) => l.approver && l.preparer && l.approver.toLowerCase() === l.preparer.toLowerCase());
    if (sa) add("SELF_APPROVED", sa.preparer);
    if (g.some((l) => l.duplicate)) add("DUP_LINE", "Repeated line within entry");
    const sig = g.map((l) => `${accountKey(l.account)}|${l.debit}|${l.credit}`).sort().join(";");
    const twins = (signatures.get(sig) || []).filter((x) => x !== je);
    if (twins.length && magnitude > 0) add("DUP_ENTRY", `Same as ${twins.slice(0, 3).join(", ")}${twins.length > 3 ? "…" : ""}`);
    if (enoughForFrequency) {
      const rare = [...new Set(g.map((l) => accountKey(l.account)))].find((a) => a && accountJEs.get(a) <= s.seldomAccountMax);
      if (rare) add("SELDOM_ACCOUNT", `${rare} used in ${accountJEs.get(rare)} entr${accountJEs.get(rare) === 1 ? "y" : "ies"}`);
      const prep = g.map((l) => l.preparer).find((p) => p && preparerJEs.get(p.toLowerCase()) <= s.infrequentPreparerMax);
      if (prep) add("UNUSUAL_USER", `${prep} posted ${preparerJEs.get(prep.toLowerCase())} entr${preparerJEs.get(prep.toLowerCase()) === 1 ? "y" : "ies"}`);
    }
    const descs = [...new Set(g.map((l) => l.description))];
    const vague = descs.every((d) => !d || d.replace(/[^a-z0-9]/gi, "").length < 4) ? "Blank or too short" : (kwRe && descs.find((d) => kwRe.test(d)));
    if (vague) add("VAGUE", vague === true ? "" : String(vague).slice(0, 60));
    const score = Math.min(100, flags.reduce((a, f) => a + (Number(s.weights[f.key]) || 0), 0));
    const preparers = [...new Set(g.map((l) => l.preparer).filter(Boolean))];
    entries.push({
      journal_id: je, posting_date: dates[0] || "", lines: g.length, debit, credit, magnitude, difference: debit - credit,
      accounts: [...new Set(g.map((l) => l.account))], preparer: preparers.join(", "),
      description: descs.filter(Boolean).slice(0, 2).join(" | "), source: [...new Set(g.map((l) => l.source).filter(Boolean))].join(", "),
      flags, flagKeys: flags.map((f) => f.key), score,
      tier: score >= s.highScore ? "High" : score >= s.mediumScore ? "Medium" : "Low",
    });
  }
  entries.sort((a, b) => b.score - a.score || b.magnitude - a.magnitude || a.journal_id.localeCompare(b.journal_id, undefined, { numeric: true }));
  return { entries, entryExceptions, largeCut: Number.isFinite(largeCut) ? largeCut : null, settings: s };
}

/* ----------------------------------------------------------- completeness */
export function completeness(lines, entries, s, controls = {}, tb = null) {
  const totalDebit = lines.reduce((a, l) => a + l.debit, 0);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0);
  const tol = s.toleranceCents ?? 1;
  const checks = [];
  checks.push({ check: "Population debits equal credits", expected: totalDebit, actual: totalCredit, difference: totalDebit - totalCredit, pass: Math.abs(totalDebit - totalCredit) <= tol, money: true });
  const ctl = [["Line count", lines.length, controls.lines, false], ["Total debits", totalDebit, controls.debits, true], ["Total credits", totalCredit, controls.credits, true], ["Journal entry count", entries.length, controls.entries, false]];
  for (const [label, actual, expected, money] of ctl) {
    if (expected === "" || expected === null || expected === undefined) continue;
    const exp = money ? toCents(expected) : Number(String(expected).replace(/,/g, ""));
    if (exp === null || Number.isNaN(exp)) { checks.push({ check: label, expected: String(expected), actual, difference: null, pass: false, money, note: "Invalid control value" }); continue; }
    const diff = actual - exp;
    checks.push({ check: `${label} agrees to independent control`, expected: exp, actual, difference: diff, pass: money ? Math.abs(diff) <= tol : diff === 0, money });
  }
  // Period coverage.
  const dates = lines.map((l) => l.posting_date).filter(Boolean).sort();
  const coverage = { first: dates[0] || "", last: dates[dates.length - 1] || "", before: 0, after: 0, undated: lines.filter((l) => !l.posting_date).length, months: [] };
  if (s.periodStart) coverage.before = lines.filter((l) => l.posting_date && l.posting_date < s.periodStart).length;
  if (s.periodEnd) coverage.after = lines.filter((l) => l.posting_date && l.posting_date > s.periodEnd).length;
  const byMonth = new Map();
  for (const e of entries) if (e.posting_date) { const k = e.posting_date.slice(0, 7); const m = byMonth.get(k) || { month: k, entries: 0, amount: 0 }; m.entries++; m.amount += e.magnitude; byMonth.set(k, m); }
  const start = s.periodStart || coverage.first, end = s.periodEnd || coverage.last;
  if (start && end) {
    let [y, m] = start.slice(0, 7).split("-").map(Number);
    const [ey, em] = end.slice(0, 7).split("-").map(Number);
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 240) { const k = `${y}-${pad(m)}`; coverage.months.push(byMonth.get(k) || { month: k, entries: 0, amount: 0 }); m++; if (m > 12) { m = 1; y++; } }
  }
  coverage.emptyMonths = coverage.months.filter((m) => m.entries === 0).map((m) => m.month);
  if (s.periodStart || s.periodEnd) checks.push({ check: "All entries dated within the period", expected: 0, actual: coverage.before + coverage.after, difference: coverage.before + coverage.after, pass: coverage.before + coverage.after === 0, money: false, note: `${coverage.before} line(s) before, ${coverage.after} after` });
  if (coverage.months.length) checks.push({ check: "Every month in the period has activity", expected: 0, actual: coverage.emptyMonths.length, difference: coverage.emptyMonths.length, pass: coverage.emptyMonths.length === 0, money: false, note: coverage.emptyMonths.join(", ") });
  // Journal number sequence gaps (per alphanumeric prefix).
  const seqGroups = new Map();
  for (const e of entries) { const m = e.journal_id.match(/^(.*?)(\d+)$/); if (!m) continue; const k = m[1] + "#" + m[2].length; if (!seqGroups.has(k)) seqGroups.set(k, { prefix: m[1], width: m[2].length, nums: [] }); seqGroups.get(k).nums.push(Number(m[2])); }
  const gaps = [];
  let gapCount = 0;
  for (const gq of seqGroups.values()) {
    if (gq.nums.length < 5) continue;
    const nums = [...new Set(gq.nums)].sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      const missing = nums[i] - nums[i - 1] - 1;
      if (missing > 0) { gapCount += missing; if (gaps.length < 200) gaps.push({ from: gq.prefix + String(nums[i - 1] + 1).padStart(gq.width, "0"), to: gq.prefix + String(nums[i] - 1).padStart(gq.width, "0"), count: missing }); }
    }
  }
  if (seqGroups.size) checks.push({ check: "Journal numbers are sequential (no gaps)", expected: 0, actual: gapCount, difference: gapCount, pass: gapCount === 0, money: false, note: gapCount ? `${gapCount} missing number(s) in ${gaps.length} range(s) — obtain explanations (voids, other ledgers, deleted entries)` : "" });
  // TB roll-forward: beginning + period activity = ending, per account.
  let rollforward = null;
  if (tb && tb.length) {
    const inPeriod = (l) => l.posting_date && (!s.periodStart || l.posting_date >= s.periodStart) && (!s.periodEnd || l.posting_date <= s.periodEnd);
    const act = new Map(), names = new Map();
    for (const l of lines) if (inPeriod(l)) { const k = accountKey(l.account); act.set(k, (act.get(k) || 0) + l.debit - l.credit); if (l.account_name) names.set(k, l.account_name); }
    const tbKeys = new Map(tb.map((r) => [accountKey(r.account), r]));
    const tbCodes = new Map(tb.map((r) => [accountCode(r.account), r]));
    const matched = new Map();
    for (const k of act.keys()) { const r = tbKeys.get(k) || tbCodes.get(accountCode(k)); if (r) matched.set(accountKey(r.account), (matched.get(accountKey(r.account)) || 0) + act.get(k)); }
    const rows = tb.map((r) => { const a = matched.get(accountKey(r.account)) || 0; const diff = r.beginning + a - r.ending; return { account: r.account, account_name: r.account_name, beginning: r.beginning, activity: a, ending: r.ending, difference: diff, pass: Math.abs(diff) <= tol }; });
    const unmatched = [...act.keys()].filter((k) => !(tbKeys.get(k) || tbCodes.get(accountCode(k)))).map((k) => ({ account: k, account_name: names.get(k) || "", activity: act.get(k) }));
    const failing = rows.filter((r) => !r.pass);
    rollforward = { rows, unmatched, failing: failing.length, totalDifference: failing.reduce((a, r) => a + Math.abs(r.difference), 0) };
    checks.push({ check: "TB roll-forward: beginning + JE activity = ending (all accounts)", expected: 0, actual: failing.length, difference: failing.length, pass: failing.length === 0 && unmatched.length === 0, money: false, note: `${failing.length} account(s) do not roll forward${unmatched.length ? `; ${unmatched.length} GL account(s) not on the TB` : ""}` });
  }
  return { checks, coverage, gaps, gapCount, rollforward, totals: { debit: totalDebit, credit: totalCredit, lines: lines.length, entries: entries.length } };
}

/* ------------------------------------------------------------------ Benford */
export function benford(entries) {
  const counts = Array(10).fill(0);
  let n = 0;
  for (const e of entries) { const dollars = Math.floor(e.magnitude / 100); if (dollars >= 10) { counts[Number(String(dollars)[0])]++; n++; } }
  const rows = [];
  let mad = 0;
  for (let d = 1; d <= 9; d++) { const exp = Math.log10(1 + 1 / d); const act = n ? counts[d] / n : 0; mad += Math.abs(act - exp); rows.push({ digit: d, count: counts[d], actual: act, expected: exp }); }
  mad /= 9;
  const conformity = n < 100 ? "Too few entries (<100) for a reliable test" : mad < 0.006 ? "Close conformity" : mad < 0.012 ? "Acceptable conformity" : mad < 0.015 ? "Marginal conformity" : "Nonconformity — investigate";
  return { n, rows, mad, conformity };
}

/* ---------------------------------------------------------------- sampling */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Select key items (≥ threshold), then highest-risk entries (score > 0), then seeded random entries.
 * Returns [{journal_id, basis, reason}].
 */
export function selectSample(entries, opts) {
  const size = Math.max(0, Math.min(5000, Math.floor(Number(opts.size) || 0)));
  const riskPct = Math.min(100, Math.max(0, Number(opts.riskPercent ?? 60)));
  const seed = Math.floor(Number(opts.seed) || 0);
  const picked = new Map();
  if (opts.keyItems && opts.thresholdCents > 0) for (const e of entries) if (e.magnitude >= opts.thresholdCents) picked.set(e.journal_id, { journal_id: e.journal_id, basis: "Key item", reason: `Amount ≥ threshold ${fmtCents(opts.thresholdCents)}` });
  const remainingSlots = Math.max(0, size - picked.size);
  const nRisk = Math.min(remainingSlots, Math.ceil(remainingSlots * riskPct / 100));
  const risky = entries.filter((e) => e.score > 0 && !picked.has(e.journal_id));
  for (const e of risky.slice(0, nRisk)) picked.set(e.journal_id, { journal_id: e.journal_id, basis: "Risk-based", reason: `Score ${e.score}: ${e.flags.map((f) => FLAGS[f.key].label).join("; ")}` });
  const pool = entries.filter((e) => !picked.has(e.journal_id)).map((e) => e.journal_id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rng = mulberry32(seed);
  const nRandom = Math.min(pool.length, size - picked.size);
  for (let i = 0; i < nRandom; i++) { const j = i + Math.floor(rng() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; picked.set(pool[i], { journal_id: pool[i], basis: "Random", reason: `Seeded random selection (seed ${seed})` }); }
  return [...picked.values()];
}

/* ------------------------------------------------------------------- utils */
export function fmtCents(c, opts = {}) {
  if (c === null || c === undefined || Number.isNaN(c)) return "";
  const neg = c < 0; const abs = Math.abs(c);
  const s = (Math.floor(abs / 100)).toLocaleString("en-US") + (opts.noCents ? "" : "." + String(abs % 100).padStart(2, "0"));
  return (neg ? "-" : "") + (opts.symbol === false ? "" : "$") + s;
}

/** Vouching: compare voucher total to the entry amount. */
export function voucherCheck(entry, vouchers, tolCents = 1) {
  const amounts = vouchers.map((v) => toCents(v.amount)).filter((x) => x !== null && x !== 0);
  if (!amounts.length) return { total: null, difference: null, agrees: null };
  const total = amounts.reduce((a, b) => a + b, 0);
  const difference = total - entry.magnitude;
  return { total, difference, agrees: Math.abs(difference) <= tolCents };
}
