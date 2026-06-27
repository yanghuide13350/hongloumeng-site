// 红楼梦知识库 · 健康审计
// 运行：node site/scripts/audit-vault.mjs [--json] [--formal-only]
// 正式区 = 知识库/ + 根目录索引/日志跳转页；排除 原始资料/归档 与 site/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const KB = path.join(ROOT, '知识库');
const JSON_OUT = process.argv.includes('--json');
const FORMAL_ONLY = process.argv.includes('--formal-only');

const SKIP_DIRS = new Set(['site', 'node_modules', 'dist', '.git', '.astro']);
const SCAN_DIRS = ['知识库', '整理规则', '原始资料'];
const ROOT_FILES = ['红楼梦 索引.md', '红楼梦整理日志.md'];

const VALID_TYPES = new Set([
  '人物', '主题', '线索', '地点', '事件', '器物', '民俗', '章节',
  '诗词单篇', '诗词场景', '诗词专题', '诗词全集', '诗词索引',
  '图表', '复习表', '导航', '索引', '规则', '方案', '来源摘要',
  '日志', '报告', '文档', '测试',
]);

const REQUIRED_FM = ['标题', '类型', '主题域', '标签', '更新时间'];
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|pdf)$/i;
const LINK_RE = /(!?)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

const INDEX_TABLES = [
  '知识库/事件/事件总表.md',
  '知识库/地点/地点总表.md',
  '知识库/器物/器物总表.md',
  '知识库/民俗/民俗总表.md',
  '红楼梦 索引.md',
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(md|canvas|yaml)$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

function isFormal(rel) {
  if (rel.startsWith('知识库' + path.sep)) return true;
  if (ROOT_FILES.includes(rel.replace(/\\/g, '/'))) return true;
  if (rel.startsWith('整理规则' + path.sep)) return true;
  return false;
}

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');
}

function parseFm(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const block = text.slice(4, end);
  const fm = {};
  let key = null;
  let list = null;
  for (const line of block.split('\n')) {
    const km = line.match(/^([\w\u4e00-\u9fff]+):\s*(.*)$/);
    if (km) {
      key = km[1];
      const v = km[2].trim();
      if (v === '') { list = []; fm[key] = list; }
      else { fm[key] = v; list = null; }
      continue;
    }
    const im = line.match(/^\s+-\s+(.*)$/);
    if (im && list) list.push(im[1].trim());
  }
  return fm;
}

// ---------- 收集文件 ----------
const allFiles = [];
for (const sd of SCAN_DIRS) walk(path.join(ROOT, sd), allFiles);
for (const fn of ROOT_FILES) {
  const p = path.join(ROOT, fn);
  if (fs.existsSync(p)) allFiles.push(p);
}

const mdFiles = allFiles.filter((f) => f.endsWith('.md'));
const scoped = FORMAL_ONLY
  ? mdFiles.filter((f) => isFormal(path.relative(ROOT, f)))
  : mdFiles;

const byBase = new Map();
const byRel = new Map();
for (const f of allFiles) {
  const rel = path.relative(ROOT, f);
  const base = path.basename(f, path.extname(f));
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(rel);
  byRel.set(rel, f);
  byRel.set(path.basename(f), f);
}

const assetNames = new Set();
function walkAssets(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAssets(p);
    else if (IMG_RE.test(e.name) || e.name.endsWith('.canvas')) {
      assetNames.add(path.basename(p, path.extname(p)));
      assetNames.add(path.basename(p));
      const rel = path.relative(ROOT, p);
      byRel.set(rel, p);
      byRel.set(path.basename(p), p);
    }
  }
}
walkAssets(ROOT);

function linkOk(tgt) {
  const base = path.basename(tgt, path.extname(tgt));
  const file = path.basename(tgt);
  if (byBase.has(base) || assetNames.has(base) || assetNames.has(file)) return true;
  if (byRel.has(tgt) || byRel.has(file)) {
    const abs = byRel.get(tgt) || byRel.get(file);
    return abs && fs.existsSync(abs);
  }
  const relPath = tgt.replace(/\\/g, '/');
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------- 审计项 ----------
const missingFm = [];
const badTypes = [];
const brokenLinks = [];
const bareImages = [];
const missingImages = [];
const emptyFiles = [];
const inbound = new Map();

for (const f of scoped) {
  const rel = path.relative(ROOT, f);
  let raw = '';
  try { raw = fs.readFileSync(f, 'utf8'); } catch { continue; }

  if (!raw.trim()) {
    emptyFiles.push(rel);
    continue;
  }

  const fm = parseFm(raw);
  if (fm) {
    for (const field of REQUIRED_FM) {
      const v = fm[field];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        missingFm.push({ file: rel, field });
      }
    }
    const kind = String(fm['类型'] ?? '').trim();
    if (kind && !VALID_TYPES.has(kind)) badTypes.push({ file: rel, type: kind });
  } else if (rel.startsWith('知识库')) {
    missingFm.push({ file: rel, field: '(frontmatter)' });
  }

  const text = stripCode(raw);
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    const [, bang, tgt] = m;
    const target = tgt.trim();
    if (bang === '!' && IMG_RE.test(target) && !target.includes('/')) {
      bareImages.push({ file: rel, target });
    }
    if (!linkOk(target)) {
      brokenLinks.push({ file: rel, target });
    } else {
      const base = path.basename(target, path.extname(target));
      inbound.set(base, (inbound.get(base) || 0) + 1);
    }
    if (bang === '!' && IMG_RE.test(target)) {
      const abs = path.join(ROOT, target);
      if (!fs.existsSync(abs)) missingImages.push({ file: rel, target });
    }
  }
}

// 总表入链：内容页应被对应总表引用
const tableLinks = new Set();
for (const rel of INDEX_TABLES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const raw = fs.readFileSync(abs, 'utf8');
  const text = stripCode(raw);
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    tableLinks.add(path.basename(m[2].trim(), path.extname(m[2].trim())));
  }
}

const CATEGORY_PREFIX = {
  '知识库/事件': '事件 - ',
  '知识库/地点': '地点 - ',
  '知识库/器物': '器物 - ',
  '知识库/民俗': '民俗 - ',
  '知识库/主题': '主题 - ',
  '知识库/线索': '线索 - ',
};

const notInTable = [];
for (const f of scoped) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const base = path.basename(f, '.md');
  for (const [prefix, namePrefix] of Object.entries(CATEGORY_PREFIX)) {
    if (!rel.startsWith(prefix + '/') || !base.startsWith(namePrefix)) continue;
    if (base.endsWith('总表') || base.includes('审计') || base.includes('索引')) break;
    if (!tableLinks.has(base)) notInTable.push(rel);
    break;
  }
}

const report = {
  scanned: scoped.length,
  formalOnly: FORMAL_ONLY,
  summary: {
    missingFm: missingFm.length,
    brokenLinks: brokenLinks.length,
    badTypes: badTypes.length,
    bareImages: bareImages.length,
    missingImages: missingImages.length,
    emptyFiles: emptyFiles.length,
    notInTable: notInTable.length,
  },
  missingFm,
  brokenLinks,
  badTypes,
  bareImages,
  missingImages,
  emptyFiles,
  notInTable,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('=== 红楼梦知识库健康审计 ===');
  console.log(`扫描页面: ${report.scanned}${FORMAL_ONLY ? '（仅正式区）' : ''}`);
  console.log('');
  const s = report.summary;
  console.log(`缺 frontmatter 字段: ${s.missingFm}`);
  console.log(`断链: ${s.brokenLinks}`);
  console.log(`非法类型: ${s.badTypes}`);
  console.log(`裸图引用: ${s.bareImages}`);
  console.log(`图片缺失: ${s.missingImages}`);
  console.log(`空文件: ${s.emptyFiles}`);
  console.log(`未接入总表: ${s.notInTable}`);
  console.log('');

  const sections = [
    ['缺 frontmatter', missingFm.slice(0, 30).map((x) => `  ${x.field} ← ${x.file}`)],
    ['断链', brokenLinks.slice(0, 40).map((x) => `  [${x.target}] ← ${x.file}`)],
    ['非法类型', badTypes.map((x) => `  ${x.type} ← ${x.file}`)],
    ['裸图', bareImages.slice(0, 20).map((x) => `  ${x.target} ← ${x.file}`)],
    ['图片缺失', missingImages.slice(0, 20).map((x) => `  ${x.target} ← ${x.file}`)],
    ['空文件', emptyFiles.map((x) => `  ${x}`)],
    ['未接入总表（前30）', notInTable.slice(0, 30).map((x) => `  ${x}`)],
  ];
  for (const [title, lines] of sections) {
    if (!lines.length) continue;
    console.log(`--- ${title} ---`);
    lines.forEach((l) => console.log(l));
    console.log('');
  }
  if (s.brokenLinks + s.missingFm + s.badTypes + s.bareImages + s.missingImages === 0) {
    console.log('✅ 核心项（断链 / frontmatter / 类型 / 图片）全部通过');
  }
}

process.exit(
  report.summary.brokenLinks + report.summary.missingFm + report.summary.badTypes > 0 ? 1 : 0
);
