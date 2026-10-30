/* Small dependency-free SVG charts. Colors come from CSS variables via classes. */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function columns(data, { height = 170, label = (d) => d.label, value = (d) => d.value, hot = () => false, title = "", fmt = (v) => v } = {}) {
  const W = 640, H = height, pl = 34, pb = 24, pt = 10;
  const max = Math.max(1, ...data.map(value));
  const bw = (W - pl) / Math.max(1, data.length);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>`;
  for (const t of ticks) { const y = H - pb - (t / max) * (H - pb - pt); s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y}" y2="${y}"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(t))}</text>`; }
  data.forEach((d, i) => {
    const v = value(d); const h = (v / max) * (H - pb - pt); const x = pl + i * bw + bw * 0.15;
    s += `<rect class="bar${hot(d) ? " hot" : ""}" x="${x}" y="${H - pb - h}" width="${bw * 0.7}" height="${Math.max(0, h)}" rx="1.5"><title>${esc(label(d))}: ${esc(fmt(v))}</title></rect>`;
    if (data.length <= 14 || i % Math.ceil(data.length / 12) === 0) s += `<text x="${x + bw * 0.35}" y="${H - 8}" text-anchor="middle">${esc(label(d))}</text>`;
  });
  return s + `<line class="axis" x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}"/></svg>`;
}

export function benfordChart(b) {
  const W = 640, H = 190, pl = 34, pb = 24, pt = 10;
  const max = Math.max(0.35, ...b.rows.map((r) => r.actual));
  const bw = (W - pl) / 9;
  const y = (v) => H - pb - (v / max) * (H - pb - pt);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="First-digit distribution compared with Benford's law"><title>First digit: actual vs Benford expected</title>`;
  for (const t of [0, 0.1, 0.2, 0.3]) s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`;
  b.rows.forEach((r, i) => { const x = pl + i * bw + bw * 0.2; s += `<rect class="bar" x="${x}" y="${y(r.actual)}" width="${bw * 0.6}" height="${H - pb - y(r.actual)}" rx="1.5"><title>Digit ${r.digit}: ${(r.actual * 100).toFixed(1)}% actual vs ${(r.expected * 100).toFixed(1)}% expected (${r.count} entries)</title></rect><text x="${x + bw * 0.3}" y="${H - 8}" text-anchor="middle">${r.digit}</text>`; });
  s += `<polyline class="exp" points="${b.rows.map((r, i) => `${pl + i * bw + bw * 0.5},${y(r.expected)}`).join(" ")}"/>`;
  return s + `<line class="axis" x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}"/></svg>`;
}
