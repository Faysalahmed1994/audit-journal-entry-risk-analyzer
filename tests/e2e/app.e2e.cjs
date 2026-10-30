/* End-to-end browser test of the full AuditJE workflow using synthetic data.
 * Run: node tests/e2e/app.e2e.cjs   (needs Playwright + Chromium; serves docs/ on localhost)
 * The folder picker is replaced with the browser's private origin file system so the
 * real File System Access code paths are exercised without a native dialog. */
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "../../docs");
const FIX = process.env.AUDITJE_FIXTURES || path.resolve(__dirname, "fixtures");
const SHOTS = process.env.AUDITJE_SHOTS || "";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".csv": "text/csv", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}

(async () => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("dialog", (d) => d.accept());
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => { const root = await navigator.storage.getDirectory(); return root.getDirectoryHandle("Maple Grove FY26 JE", { create: true }); };
  });
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false }); };

  await page.goto(base);
  await page.waitForFunction(() => window.ExcelJS && window.__auditje);
  await shot("01-home");
  await page.click("[data-home=new]");
  await page.waitForSelector("[data-bind='engagement.client']");
  await page.fill("[data-bind='engagement.client']", "Village of Maple Grove (synthetic)");
  await page.fill("[data-bind='engagement.engagementName']", "FY2026 audit");
  await page.fill("[data-bind='settings.periodStart']", "2025-07-01");
  await page.fill("[data-bind='settings.periodEnd']", "2026-06-30");
  await page.fill("[data-bind='engagement.preparedBy']", "F. Auditor");
  await page.fill("[data-money=thresholdCents]", "250000"); await page.press("[data-money=thresholdCents]", "Tab");
  await shot("02-engagement");
  await page.click("button.tab[data-go=population]");
  await page.setInputFiles("[data-file=pop]", path.join(ROOT, "assets/sample/synthetic_journal_entries.csv"));
  await page.waitForSelector("[data-action=import-pop]");
  await shot("03-mapping");
  await page.click("[data-action=import-pop]");
  await page.waitForSelector(".figures");
  const st1 = await page.evaluate(() => ({ pop: window.__auditje.state.population, lines: window.__auditje.runtime.norm.lines.length }));
  assert.equal(st1.lines, 822); assert.match(st1.pop.sha256, /^[0-9a-f]{64}$/); assert.equal(st1.pop.savedPath, "01_Population/synthetic_journal_entries.csv");
  await page.click("button.tab[data-go=completeness]");
  await page.fill("[data-ctl=lines]", "822"); await page.press("[data-ctl=lines]", "Tab");
  await page.setInputFiles("[data-file=tb]", path.join(ROOT, "assets/sample/synthetic_trial_balance.csv"));
  await page.click("[data-action=import-tb]");
  await page.waitForSelector("text=Roll-forward by account");
  const checks = await page.evaluate(() => window.__auditje.runtime.comp.checks.map((c) => [c.check, c.pass]));
  assert.ok(checks.some(([c, p]) => /Line count/.test(c) && p), "line count control agrees");
  assert.ok(checks.some(([c, p]) => /roll-forward/.test(c) && !p), "TB roll-forward catches planted difference");
  await shot("04-completeness");
  await page.click("button.tab[data-go=risk]");
  await page.waitForSelector("#register tbody tr");
  await shot("05-risk");
  await page.click("#register tbody tr:first-child");
  await page.waitForSelector("#drawer.open");
  await shot("06-drawer");
  await page.click("[data-close]");
  await page.click("[data-flagfilter=DUP_ENTRY]");
  assert.equal(await page.locator("#register tbody tr").count(), 2, "duplicate-entry filter shows the planted pair");
  await page.click("button.tab[data-go=sample]");
  await page.click("[data-action=select]");
  await page.waitForSelector("text=entries selected");
  const sample = await page.evaluate(() => window.__auditje.state.sample);
  assert.ok(sample.length >= 25); assert.ok(sample.some((x) => x.basis === "Key item")); assert.ok(sample.some((x) => x.basis === "Random"));
  await shot("07-sample");
  await page.click("button.tab[data-go=vouch]");
  const firstJe = sample[0].journal_id;
  await page.setInputFiles("[data-file=voucher]", [path.join(FIX, "invoice.png"), path.join(FIX, "approval.pdf")]);
  await page.waitForSelector(".voucher img[src^=blob]");
  await page.fill("[data-vf='0.amount']", "250000.00");
  await page.selectOption("[data-vf='0.docType']", "Invoice");
  for (const a of ["supported", "amount", "period", "classification", "authorized"]) await page.check(`input[data-attr=${a}][value=Yes]`, { force: true });
  await page.check("input[data-attr=purpose][value=No]", { force: true });
  await page.waitForSelector("[data-vc=exceptionDetail]");
  await page.fill("[data-vc=exceptionDetail]", "Reclass rationale not documented; CFO approved own entry.");
  await shot("08-vouch");
  await page.click("[data-action=vouch-next]");
  const v = await page.evaluate((je) => window.__auditje.state.vouching[je], firstJe);
  assert.equal(v.conclusion, "Exception"); assert.equal(v.vouchers.length, 2); assert.equal(v.vouchers[0].ref, "V-001");
  assert.ok(v.vouchers[0].path.startsWith("03_Vouchers/"));
  await page.click("button.tab[data-go=workpaper]");
  await page.fill("[data-bind='engagement.conclusion']", "Synthetic test conclusion.");
  await page.click("[data-action=export]");
  await page.waitForFunction(() => window.__auditje.state.lastExport);
  await shot("09-workpaper");
  // Read the saved workbook back out of the engagement folder and inspect it.
  const saved = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("Maple Grove FY26 JE");
    const list = async (d, pre = "") => { const out = []; for await (const [n, hnd] of d.entries()) { if (hnd.kind === "directory") out.push(...await list(hnd, pre + n + "/")); else out.push(pre + n); } return out; };
    const files = await list(root);
    const wp = files.find((f) => f.startsWith("02_Workpapers/"));
    const parts = wp.split("/"); const f = await (await (await root.getDirectoryHandle(parts[0])).getFileHandle(parts[1])).getFile();
    const b = new Uint8Array(await f.arrayBuffer()); let s = ""; for (const x of b) s += String.fromCharCode(x);
    return { files, wp: btoa(s) };
  });
  assert.ok(saved.files.includes("engagement.json")); assert.ok(saved.files.some((f) => f.startsWith("03_Vouchers/") && f.includes("V-001")));
  if (process.env.AUDITJE_DUMP) fs.writeFileSync(process.env.AUDITJE_DUMP, Buffer.from(saved.wp, "base64"));
  await page.waitForTimeout(1200);
  assert.match(await page.textContent("#saveText"), /^Saved to “Maple Grove FY26 JE”/, "autosave settles to saved");
  const ExcelJS = require(process.env.EXCELJS_PATH || "exceljs");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(saved.wp, "base64"));
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ["Cover", "Completeness", "TB Rollforward", "Sample & Vouching", "Voucher Index", "Risk Register", "Sample Changes", "Data Quality", "GL Population", "Methodology", "Voucher Images"]) assert.ok(names.includes(n), "sheet " + n);
  const link = wb.getWorksheet("Voucher Index").getCell("H5").value;
  assert.ok(link.hyperlink && link.hyperlink.startsWith("../03_Vouchers/"), "voucher hyperlink is relative to the workpaper");
  // Reload and resume from the folder.
  await page.reload(); await page.waitForSelector("[data-home=recent]");
  await page.click("[data-home=open]"); await page.waitForSelector(".tab[aria-current=page]");
  const resumed = await page.evaluate(() => ({ lines: window.__auditje.runtime.norm?.lines.length, sample: window.__auditje.state.sample.length, step: window.__auditje.state.current }));
  assert.equal(resumed.lines, 822); assert.equal(resumed.sample, sample.length);
  // Sample engagement path (session mode) and dark theme.
  await page.click("#brandLink"); await page.click("[data-home=sample]"); await page.waitForSelector("text=Roll-forward by account");
  await page.click("#themeBtn"); await page.click("button.tab[data-go=risk]"); await page.waitForSelector("#register tbody tr"); await shot("10-dark-risk");
  const external = requests.filter((u) => !u.startsWith(base) && !u.startsWith("blob:") && !u.startsWith("data:"));
  assert.deepEqual(external, [], "no network requests outside the app origin");
  assert.deepEqual(problems, [], "no console errors or CSP violations");
  console.log(`E2E passed: ${names.length} workpaper tabs, ${sample.length} sampled entries, ${saved.files.length} files in the engagement folder.`);
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
