/* File reading helpers: CSV and XLSX into header + row objects. No network access. */

export function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

function detectDelimiter(sample) {
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim()) || "";
  const counts = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180 CSV parser (quoted fields, embedded delimiters/newlines, doubled quotes). */
export function parseCSV(textIn) {
  const text = textIn.replace(/^﻿/, "");
  const delim = detectDelimiter(text.slice(0, 5000));
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function cellValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return "";
    return String(v);
  }
  return v;
}

function toObjects(matrix) {
  const headerIdx = matrix.findIndex((r) => r.filter((v) => String(v ?? "").trim() !== "").length >= 2);
  if (headerIdx < 0) throw new Error("Could not find a header row with at least two column names.");
  const raw = matrix[headerIdx].map((h) => String(h ?? "").trim());
  const seen = {};
  const headers = raw.map((h, i) => { let name = h || `Column ${i + 1}`; if (seen[name]) name = `${name} (${++seen[name]})`; else seen[name] = 1; return name; });
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const vals = matrix[r];
    if (!vals || !vals.some((v) => String(v ?? "").trim() !== "")) continue;
    const o = { __row: r + 1 };
    headers.forEach((h, i) => { o[h] = vals[i] ?? ""; });
    rows.push(o);
  }
  return { headers, rows };
}

/**
 * Read a CSV or XLSX file (ArrayBuffer) into {headers, rows, sheetNames, sheet}.
 * ExcelJS is passed in so the module also runs in Node tests.
 */
export async function readTable(fileName, buffer, ExcelJS, sheetName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    const out = toObjects(parseCSV(decodeText(new Uint8Array(buffer))));
    return { ...out, sheetNames: [], sheet: "" };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    if (!ExcelJS) throw new Error("Excel support did not load. Save the file as CSV and try again.");
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); } catch { throw new Error("Could not read this Excel file. Make sure it is a valid .xlsx workbook (not password-protected), or save it as CSV."); }
    const sheets = wb.worksheets.filter((ws) => ws.actualRowCount > 0);
    if (!sheets.length) throw new Error("The workbook has no data.");
    const ws = sheets.find((w) => w.name === sheetName) || sheets[0];
    const matrix = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cellValue(cell.value); });
      matrix[rowNumber - 1] = vals;
    });
    for (let i = 0; i < matrix.length; i++) if (!matrix[i]) matrix[i] = [];
    const out = toObjects(matrix);
    return { ...out, sheetNames: sheets.map((s) => s.name), sheet: ws.name };
  }
  if (lower.endsWith(".xls")) throw new Error("Legacy .xls files are not supported. In Excel choose File → Save As → .xlsx or .csv.");
  throw new Error("Unsupported file type. Use .csv or .xlsx.");
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
