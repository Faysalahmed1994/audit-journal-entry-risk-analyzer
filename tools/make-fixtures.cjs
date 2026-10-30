// Regenerates the synthetic voucher fixtures used by the end-to-end test (fictional documents).
// Run from tests/e2e/fixtures: node ../../../tools/make-fixtures.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 820, height: 1000 } });
  const html = (no, amt) => `<html><body style="font-family:Georgia;padding:50px;color:#222"><h1 style="margin:0">INVOICE</h1><p>Synthetic Engineering Co. (fictional)<br>100 Example Ave</p><hr><p><b>Invoice no:</b> ${no}<br><b>Date:</b> 06/30/2026<br><b>Bill to:</b> Village of Maple Grove (synthetic)</p><table border=1 cellpadding=8 style="border-collapse:collapse;width:100%"><tr><th>Description</th><th>Amount</th></tr><tr><td>Engineering services, June 2026</td><td style="text-align:right">$${amt}</td></tr><tr><td><b>Total due</b></td><td style="text-align:right"><b>$${amt}</b></td></tr></table><p style="margin-top:40px;color:#888">SYNTHETIC DEMONSTRATION DOCUMENT</p></body></html>`;
  await p.setContent(html('INV-7781', '42,500.00')); await p.screenshot({ path: 'invoice.png' });
  await p.setContent(html('INV-7782', '1,000.00')); await p.pdf({ path: 'approval.pdf', format: 'Letter' });
  await b.close();
})();
