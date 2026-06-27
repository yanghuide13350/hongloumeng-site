// 红楼梦知识库 · Obsidian chart 代码块 → 内联 SVG 渲染器
// 在 build-data.mjs 构建时调用，把 ```chart``` YAML 块转为静态 SVG，
// 沿用水墨黑白 + 朱砂钤印的站点视觉系统，零客户端 JS。
// 支持 type: bar / doughnut / pie / line。

// 站点配色回退序列（当 md 块未指定颜色，或数量不足时补位）
const INK_PALETTE = [
  '#9E3D32', '#3A4A52', '#6B7B45', '#B08D57', '#4F6457',
  '#8C5A6B', '#7A7A85', '#A8612F', '#5A6E78', '#996A8A',
];

function rgbaToHex(rgba) {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}
function rgbaAlpha(rgba) {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  return m && m[4] != null ? parseFloat(m[4]) : 1;
}

// 宽松 YAML 解析：只处理 chart 块用到的字面子集
function parseChartYaml(text) {
  const cfg = { labels: [], series: [], backgroundColor: [], borderColor: [], borderWidth: 2 };
  const lines = text.split(/\r?\n/);
  let i = 0, inSeries = false;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const indent = raw.match(/^\s*/)[0].length;

    if (inSeries && /^\s*-\s+title:/.test(line)) {
      const title = line.split('title:')[1].trim();
      const dataLine = (lines[i + 1] || '').match(/data:\s*\[([^\]]*)\]/);
      const data = dataLine ? dataLine[1].split(',').map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x)) : [];
      cfg.series.push({ title, data });
      i += 2; continue;
    }
    if (inSeries && indent === 0) inSeries = false;

    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const [, key, val] = kv;
      switch (key) {
        case 'type': cfg.type = val.trim(); break;
        case 'title': cfg.title = val.trim(); break;
        case 'labels': cfg.labels = parseList(val); break;
        case 'width': cfg.width = val.trim(); break;
        case 'height': cfg.height = parseInt(val, 10) || 400; break;
        case 'showLegend': cfg.showLegend = val.trim() === 'true'; break;
        case 'legendPosition': cfg.legendPosition = val.trim(); break;
        case 'beginAtZero': cfg.beginAtZero = val.trim() === 'true'; break;
        case 'tension': cfg.tension = parseFloat(val) || 0; break;
        case 'fill': cfg.fill = val.trim() === 'true'; break;
        case 'borderWidth': cfg.borderWidth = parseInt(val, 10) || 2; break;
        case 'backgroundColor': cfg.backgroundColor = parseColorList(val, lines, i); break;
        case 'borderColor': cfg.borderColor = parseColorList(val, lines, i); break;
        case 'series': inSeries = true; break;
      }
    }
    i++;
  }
  return cfg;
}

function parseList(val) {
  const m = val.match(/\[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function parseColorList(val, lines, startIdx) {
  const out = [];
  const inline = val.match(/\[([^\]]*)\]/);
  if (inline) {
    out.push(...inline[1].split(',').map((x) => x.trim()).filter(Boolean));
    return out;
  }
  let j = startIdx + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) continue;
    const ind = l.match(/^\s*/)[0].length;
    if (ind === 0) break;
    const m = l.match(/^\s*-\s+(.*)$/);
    if (m) out.push(m[1].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

function colorAt(list, idx) {
  const raw = list[idx] || INK_PALETTE[idx % INK_PALETTE.length];
  return raw.startsWith('#') ? raw : (rgbaToHex(raw) || INK_PALETTE[idx % INK_PALETTE.length]);
}
function alphaAt(list, idx) {
  const raw = list[idx];
  if (!raw) return 1;
  if (raw.startsWith('#')) return 1;
  return rgbaAlpha(raw);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 柱状图
function renderBar(cfg) {
  const labels = cfg.labels;
  const series = cfg.series.length ? cfg.series : [{ title: '', data: [] }];
  const n = labels.length;
  const W = 760, H = cfg.height || 400;
  const padL = 48, padR = 16, padT = cfg.showLegend ? 36 : 18, padB = 56;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const allVals = series.flatMap((s) => s.data);
  const maxV = Math.max(1, ...allVals);
  const minV = cfg.beginAtZero === false ? Math.min(0, ...allVals) : 0;
  const span = maxV - minV || 1;
  const groupW = plotW / n;
  const barGap = 6;
  const barW = series.length > 1 ? (groupW - barGap * 2) / series.length : Math.min(groupW - barGap * 2, 56);
  const baseY = padT + plotH * (maxV / span);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="hlm-chart" role="img" aria-label="${esc(cfg.title || '柱状图')}">`;
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = minV + (span * t) / ticks;
    const y = padT + plotH * (1 - (v - minV) / span);
    svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--ink-hair)" stroke-width="1"/>`;
    svg += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="ax">${Math.round(v)}</text>`;
  }
  svg += `<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="var(--ink-2)" stroke-width="1.2"/>`;

  labels.forEach((lab, gi) => {
    const gx = padL + gi * groupW + barGap;
    series.forEach((s, si) => {
      const v = s.data[gi] ?? 0;
      const h = Math.abs(v - minV) / span * plotH;
      const y = v >= minV ? baseY - h : baseY;
      const ci = series.length > 1 ? si : gi;
      svg += `<rect x="${(gx + si * barW).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${colorAt(cfg.backgroundColor, ci)}" opacity="${alphaAt(cfg.backgroundColor, ci)}" stroke="${colorAt(cfg.borderColor, ci)}" stroke-width="${cfg.borderWidth}"/>`;
    });
    const lx = padL + gi * groupW + groupW / 2;
    svg += `<text x="${lx.toFixed(1)}" y="${(H - padB + 20).toFixed(1)}" text-anchor="middle" class="ax">${esc(lab)}</text>`;
  });

  if (cfg.showLegend) svg += legend(series, cfg, W);
  svg += `</svg>`;
  return svg;
}

// 折线图
function renderLine(cfg) {
  const labels = cfg.labels;
  const series = cfg.series;
  const n = labels.length;
  const W = 760, H = cfg.height || 400;
  const padL = 48, padR = 16, padT = cfg.showLegend ? 36 : 18, padB = 56;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const allVals = series.flatMap((s) => s.data);
  const maxV = Math.max(1, ...allVals), minV = Math.min(0, ...allVals);
  const span = maxV - minV || 1;
  const xAt = (i) => padL + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const yAt = (v) => padT + plotH * (1 - (v - minV) / span);
  const baseY = padT + plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="hlm-chart" role="img" aria-label="${esc(cfg.title || '折线图')}">`;
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = minV + (span * t) / ticks;
    const y = yAt(v);
    svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--ink-hair)" stroke-width="1"/>`;
    svg += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="ax">${Math.round(v)}</text>`;
  }
  labels.forEach((lab, i) => {
    svg += `<text x="${xAt(i).toFixed(1)}" y="${(H - padB + 20).toFixed(1)}" text-anchor="middle" class="ax">${esc(lab)}</text>`;
  });

  series.forEach((s, si) => {
    const stroke = colorAt(cfg.borderColor, si);
    const fill = cfg.fill ? colorAt(cfg.backgroundColor, si) : 'none';
    const op = cfg.fill ? alphaAt(cfg.backgroundColor, si) : 1;
    const pts = s.data.map((v, i) => [xAt(i), yAt(v)]);
    if (cfg.fill && pts.length > 1) {
      const areaPath = `M ${pts[0][0].toFixed(1)},${baseY.toFixed(1)} ` +
        pts.map((p) => `L ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
        ` L ${pts[pts.length - 1][0].toFixed(1)},${baseY.toFixed(1)} Z`;
      svg += `<path d="${areaPath}" fill="${fill}" opacity="${(op * 0.5).toFixed(2)}"/>`;
    }
    const d = smoothPath(pts, cfg.tension);
    svg += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${cfg.borderWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    pts.forEach((p) => svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${stroke}"/>`);
  });

  if (cfg.showLegend) svg += legend(series, cfg, W);
  svg += `</svg>`;
  return svg;
}

function smoothPath(pts, tension) {
  if (pts.length < 2) return '';
  if (!tension) return 'M ' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ');
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// 饼图 / 环图
function renderPie(cfg, doughnut) {
  const labels = cfg.labels;
  const series = cfg.series.length ? cfg.series : [{ data: [] }];
  const data = series[0].data;
  const total = data.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const W = 520, H = cfg.height || 400;
  const cx = cfg.showLegend && cfg.legendPosition === 'right' ? W * 0.35 : W / 2;
  const cy = H / 2;
  const R = Math.min(cx, cy) - 12;
  const r = doughnut ? R * 0.58 : 0;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="hlm-chart" role="img" aria-label="${esc(cfg.title || (doughnut ? '环图' : '饼图'))}">`;
  let a = -Math.PI / 2;
  labels.forEach((lab, i) => {
    const v = Math.max(0, data[i] ?? 0);
    const ang = (v / total) * Math.PI * 2;
    if (ang <= 0) return;
    const a2 = a + ang;
    const large = ang > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a);
    const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    const ix1 = cx + r * Math.cos(a2), iy1 = cy + r * Math.sin(a2);
    const ix2 = cx + r * Math.cos(a), iy2 = cy + r * Math.sin(a);
    const fill = colorAt(cfg.backgroundColor, i);
    const path = doughnut
      ? `M ${x1.toFixed(1)},${y1.toFixed(1)} A ${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L ${ix1.toFixed(1)},${iy1.toFixed(1)} A ${r},${r} 0 ${large} 0 ${ix2.toFixed(1)},${iy2.toFixed(1)} Z`
      : `M ${cx},${cy} L ${x1.toFixed(1)},${y1.toFixed(1)} A ${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    svg += `<path d="${path}" fill="${fill}" opacity="${alphaAt(cfg.backgroundColor, i)}" stroke="${colorAt(cfg.borderColor, i)}" stroke-width="${cfg.borderWidth}"/>`;
    const pct = (v / total) * 100;
    if (pct > 4) {
      const ma = (a + a2) / 2;
      const lr = doughnut ? (R + r) / 2 : R * 0.62;
      const lx = cx + lr * Math.cos(ma), ly = cy + lr * Math.sin(ma);
      svg += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" class="pie-pct">${Math.round(pct)}%</text>`;
    }
    a = a2;
  });
  if (cfg.showLegend) svg += pieLegend(labels, data, total, cfg, W, H, cx, R);
  svg += `</svg>`;
  return svg;
}

function legend(series, cfg, W) {
  const items = series.map((s, i) => `<span class="lg"><i style="background:${colorAt(cfg.borderColor, i)}"></i>${esc(s.title || cfg.labels[i] || '')}</span>`).join('');
  return `<foreignObject x="16" y="4" width="${W - 32}" height="28"><div xmlns="http://www.w3.org/1999/xhtml" class="hlm-chart-legend">${items}</div></foreignObject>`;
}
function pieLegend(labels, data, total, cfg, W, H, cx, R) {
  const items = labels.map((lab, i) => {
    const v = data[i] ?? 0;
    const pct = ((v / total) * 100).toFixed(0);
    return `<li><i style="background:${colorAt(cfg.backgroundColor, i)};opacity:${alphaAt(cfg.backgroundColor, i)}"></i><span class="lg-l">${esc(lab)}</span><span class="lg-v">${v} · ${pct}%</span></li>`;
  }).join('');
  const lx = cx + R + 24;
  return `<foreignObject x="${lx}" y="${H / 2 - 110}" width="${Math.max(80, W - lx - 8)}" height="220"><div xmlns="http://www.w3.org/1999/xhtml" class="hlm-chart-pielegend"><ul>${items}</ul></div></foreignObject>`;
}

export function renderChartBlock(yamlText) {
  let cfg;
  try { cfg = parseChartYaml(yamlText); }
  catch (e) { return `<p class="hlm-chart-fallback">（图表解析失败：${esc(e.message)}）</p>`; }
  if (!cfg.type || !cfg.labels.length) return `<p class="hlm-chart-fallback">（图表数据不完整）</p>`;
  const t = cfg.type.toLowerCase();
  let svg;
  if (t === 'bar') svg = renderBar(cfg);
  else if (t === 'line') svg = renderLine(cfg);
  else if (t === 'doughnut') svg = renderPie(cfg, true);
  else if (t === 'pie') svg = renderPie(cfg, false);
  else return `<pre class="hlm-chart-fallback"><code>${esc(yamlText)}</code></pre>`;
  const cap = cfg.title ? `<figcaption>${esc(cfg.title)}</figcaption>` : '';
  return `<figure class="hlm-chart-figure">${svg}${cap}</figure>`;
}

export const CHART_CSS = `
.hlm-chart-figure { margin: 1.8rem auto; max-width: 100%; text-align: center; }
.hlm-chart { width: 100%; height: auto; max-width: 760px; }
.hlm-chart .ax { font-family: var(--sans); font-size: 11px; fill: var(--ink-faint); }
.hlm-chart .pie-pct { font-family: var(--sans); font-size: 12px; font-weight: 700; fill: #fff; }
.hlm-chart-figure figcaption { font-family: var(--serif); font-size: .9rem; color: var(--ink-2); margin-top: .6rem; letter-spacing: .04em; }
.hlm-chart-legend { display: flex; flex-wrap: wrap; gap: .3rem 1rem; justify-content: center; font-size: .8rem; color: var(--ink-2); }
.hlm-chart-legend .lg { display: inline-flex; align-items: center; gap: .35rem; }
.hlm-chart-legend .lg i { width: .8rem; height: .8rem; border-radius: 2px; display: inline-block; }
.hlm-chart-pielegend ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .3rem; }
.hlm-chart-pielegend li { display: flex; align-items: center; gap: .4rem; font-size: .82rem; color: var(--ink-2); }
.hlm-chart-pielegend li i { width: .8rem; height: .8rem; border-radius: 2px; flex: none; }
.hlm-chart-pielegend .lg-l { flex: 1; }
.hlm-chart-pielegend .lg-v { color: var(--ink-faint); font-size: .78rem; }
.hlm-chart-fallback { padding: 1rem; background: var(--paper-sunk); border: 1px dashed var(--ink-hair); border-radius: var(--radius); color: var(--ink-faint); font-size: .88rem; }
`;
