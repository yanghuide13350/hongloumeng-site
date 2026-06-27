// 红楼梦知识库 · 数据管线（md → JSON）
// 输入：../知识库/**/*.md + ../红楼梦 索引.md + 各处 assets 图片
// 输出：src/data/*.json + public/images/**
// 运行：npm run build:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import GithubSlugger from 'github-slugger';
import sharp from 'sharp';
import { renderChartBlock, CHART_CSS } from '../src/lib/chart-svg.mjs';

// 图片优化参数：栅格图转 WebP、限宽、压缩（详情页立绘最宽约 300–900px）
const IMG_MAX_WIDTH = 900;
const IMG_QUALITY = 80;
const RASTER_RE = /\.(png|jpe?g)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const RESOURCE_RE = /\.(canvas|ya?ml|excalidraw)$/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');        // 知识库根
const KB = path.join(ROOT, '知识库');
const INDEX_MD = path.join(ROOT, '红楼梦 索引.md');
const OUT = path.resolve(__dirname, '../src/data');
const IMG_OUT = path.resolve(__dirname, '../public/images');
const RES_OUT = path.resolve(__dirname, '../public/resources');

// 类型 → 站点路由
const TYPE_ROUTE = {
  人物: 'characters', 主题: 'themes', 事件: 'events', 地点: 'places',
  器物: 'objects', 民俗: 'folklore', 线索: 'clues', 图表: 'charts',
  章节: 'chapters', 诗词: 'poems', 导航: 'guide', 索引: 'guide',
  规则: 'guide', 方案: 'guide', 日志: 'guide', 来源摘要: 'guide',
};
// frontmatter「类型」字段属于门户/工具/聚合页（不计入词条统计，但仍生成页面）
const TOOL_KINDS = new Set(['复习表', '诗词索引', '诗词全集', '诗词专题', '索引', '导航', '工具页', '规则', '方案', '日志', '来源摘要']);
// 知识库主干外、仍需发布的支撑页（规则、日志、红学版本/作者基础页等）
const EXTRA_MD = [
  '红楼梦整理日志.md',
  '整理规则/红楼梦整理规则.md',
  '整理规则/红楼梦知识库方案.md',
  '整理规则/红楼梦诗词场景化整理规范.md',
  '整理规则/知识库健康检查清单.md',
  '原始资料/红楼梦 来源摘要.md',
];

// ---------- 工具函数 ----------
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'site'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'assets') continue; // 图片单独复制
      walk(p, acc);
    } else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}
function walkResources(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'site'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkResources(p, acc);
    else if (RESOURCE_RE.test(e.name)) acc.push(p);
  }
  return acc;
}
function findAssetDirs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (['node_modules', '.git', 'site'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.name === 'assets') acc.push(p);
    else findAssetDirs(p, acc);
  }
  return acc;
}
// 站点 slug：去掉「类型 - 」前缀，保留中文，空格/斜杠转 -
function slugify(s) {
  return String(s).trim()
    .replace(/[\/\\]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[，。、：；！？「」『』（）()\[\]【】《》·…—~`'"*]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function stripPrefix(base) {
  // 「人物 - 贾宝玉」→「贾宝玉」；「章节总览 - 第1回」→「第1回」；裸名原样
  const i = base.indexOf(' - ');
  return i >= 0 ? base.slice(i + 3) : base;
}
function imgHref(raw) {
  // 「知识库/人物/assets/X/y.png」→「/images/人物/assets/X/y.webp」（栅格图统一转 webp）
  let p = raw.replace(/^\.?\//, '').replace(/^知识库\//, '');
  p = p.replace(RASTER_RE, '.webp');
  return '/images/' + p.split('/').map(encodeURIComponent).join('/');
}
function resourceHref(rel) {
  return '/resources/' + rel.split('/').map(encodeURIComponent).join('/');
}
function normalizeVaultPath(raw) {
  return String(raw).trim().replace(/^\.?\//, '').replace(/\\/g, '/').replace(/^\/+/, '');
}
const stripTags = (h) => h.replace(/<[^>]+>/g, '').trim();

// ---------- 第一遍：建页面表 + slug 映射 ----------
const files = walk(KB);
if (fs.existsSync(INDEX_MD)) files.push(INDEX_MD);
for (const rel of EXTRA_MD) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) files.push(abs);
}

const pages = [];                 // 全量页面记录
const byBasename = new Map();     // basename → page（用于 wikilink 解析）
const warnings = [];
const resourceFiles = walkResources(KB);
const resourceByRel = new Map();       // 知识库/图表/X.canvas → resource
const resourceByBasename = new Map();  // X.canvas → resource

for (const file of resourceFiles) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const res = { file, rel, basename: path.basename(file), href: resourceHref(rel) };
  resourceByRel.set(rel, res);
  resourceByRel.set(rel.replace(/^知识库\//, ''), res);
  if (!resourceByBasename.has(res.basename)) resourceByBasename.set(res.basename, res);
  else warnings.push(`重名资源文件: ${res.basename}（${rel}）`);
}

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const parts = rel.split(path.sep);
  const basename = path.basename(file, '.md');
  const text = fs.readFileSync(file, 'utf8');
  let fm = {}, body = text;
  try { const g = matter(text); fm = g.data || {}; body = g.content; }
  catch (err) { warnings.push(`frontmatter 解析失败 ${rel}: ${err.message}`); }

  const kind = String(fm['类型'] ?? '').trim();          // frontmatter 类型字段
  // 路由归类：知识库主干用目录名；主干外（索引/原始资料等）用「类型」字段
  const dirType = parts[0] === '知识库' ? parts[1]
    : (TYPE_ROUTE[kind] ? kind : '索引');
  const title = String(fm['标题'] ?? basename).trim();
  const typeRoute = TYPE_ROUTE[dirType] ?? 'misc';

  // 章节单回判定：basename 形如「章节总览 - 第N回」；分组页含「X-Y回」或「前N回」无具体回号
  let chapterNo = null;
  if (dirType === '章节') {
    const m = basename.match(/第(\d+)回/);
    if (m && !/\d+\s*-\s*\d+\s*回/.test(basename)) chapterNo = Number(m[1]);
  }
  const isTool = TOOL_KINDS.has(kind) || (dirType === '章节' && chapterNo === null);
  const isEntry = !isTool;

  const page = {
    basename, title, type: dirType, typeRoute, kind,
    slug: '', // 第一遍后统一分配
    rel, file, body, fm, isEntry, chapterNo,
  };
  pages.push(page);
  if (!byBasename.has(basename)) byBasename.set(basename, page);
  else warnings.push(`重名 basename: ${basename}（${rel}）`);
}

// 分配唯一 slug
const slugTaken = new Map();
for (const p of pages) {
  let s = slugify(stripPrefix(p.basename)) || slugify(p.basename) || 'p';
  if (slugTaken.has(s) && slugTaken.get(s) !== p) {
    s = slugify(p.basename); // 冲突回退含前缀
    let n = 2; const base0 = s;
    while (slugTaken.has(s) && slugTaken.get(s) !== p) s = `${base0}-${n++}`;
  }
  slugTaken.set(s, p);
  p.slug = s;
}

// ---------- 复制 / 优化图片 ----------
// 栅格图（png/jpg）→ 限宽 WebP（大幅瘦身）；矢量/动图（svg/gif/webp）原样复制；忽略 .DS_Store 等
fs.rmSync(IMG_OUT, { recursive: true, force: true });
let imgCount = 0, imgBytesIn = 0, imgBytesOut = 0;

async function processImageFile(srcFile, destFile) {
  const name = path.basename(srcFile);
  if (name.startsWith('.')) return; // .DS_Store 等
  const ext = path.extname(srcFile).toLowerCase();
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  try {
    const inStat = fs.statSync(srcFile);
    if (RASTER_RE.test(name)) {
      const out = destFile.replace(RASTER_RE, '.webp');
      await sharp(srcFile)
        .rotate()
        .resize({ width: IMG_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMG_QUALITY })
        .toFile(out);
      imgBytesIn += inStat.size; imgBytesOut += fs.statSync(out).size; imgCount++;
    } else if (/\.(gif|webp|svg)$/i.test(name)) {
      fs.copyFileSync(srcFile, destFile);
      imgBytesIn += inStat.size; imgBytesOut += inStat.size; imgCount++;
    }
  } catch (err) {
    warnings.push(`图片处理失败 ${path.relative(ROOT, srcFile)}: ${err.message}`);
    try { fs.copyFileSync(srcFile, destFile); } catch {}
  }
}

async function processAssetDir(assetDir) {
  const relDir = path.relative(KB, assetDir);          // e.g. 人物/assets
  const destRoot = path.join(IMG_OUT, relDir);
  const tasks = [];
  for (const ent of fs.readdirSync(assetDir, { recursive: true, withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const sub = path.relative(assetDir, path.join(ent.parentPath ?? ent.path, ent.name));
    tasks.push(processImageFile(path.join(assetDir, sub), path.join(destRoot, sub)));
  }
  await Promise.all(tasks);
}

for (const assetDir of findAssetDirs(KB)) await processAssetDir(assetDir);

// ---------- 复制非 Markdown 可视化资源 ----------
fs.rmSync(RES_OUT, { recursive: true, force: true });
let resourceCount = 0, resourceBytes = 0;
for (const file of resourceFiles) {
  const rel = path.relative(ROOT, file);
  const dest = path.join(RES_OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  resourceCount++;
  resourceBytes += fs.statSync(file).size;
}

// ---------- 第二遍：正文 → HTML + 出链 + 小节 + 图片 ----------
const processor = unified()
  .use(remarkParse).use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSlug)
  .use(rehypeStringify, { allowDangerousHtml: true });

const unresolved = new Map(); // basename → count（未解析出链）

function resolveResource(raw) {
  const clean = normalizeVaultPath(raw);
  if (!RESOURCE_RE.test(clean)) return null;
  const candidates = [clean];
  if (!clean.startsWith('知识库/')) candidates.push(`知识库/${clean}`);
  for (const rel of candidates) {
    const hit = resourceByRel.get(rel);
    if (hit) return hit;
  }
  return resourceByBasename.get(path.posix.basename(clean)) || null;
}

function resolveLink(inner, ownSlugger) {
  // inner 不含外层 [[ ]]，可能带 |别名 与 #锚点
  let linkPart = inner, alias = null;
  const bar = inner.indexOf('|');
  if (bar >= 0) { linkPart = inner.slice(0, bar); alias = inner.slice(bar + 1).trim(); }
  let [targetPart, anchorPart] = linkPart.split('#');
  targetPart = normalizeVaultPath(targetPart || '');
  const pageTargetPart = targetPart.replace(/\.md$/i, '');
  const baseName = pageTargetPart ? path.basename(pageTargetPart) : '';
  // 页内锚点 [[#小节]]
  if (!baseName) {
    const text = alias || anchorPart || '';
    return { href: '#' + ownSlugger.slug(anchorPart || ''), text, resolved: true, target: null };
  }
  const target = byBasename.get(baseName);
  const display = alias || baseName;
  if (!target) {
    const resource = resolveResource(targetPart);
    if (resource) return { href: resource.href, text: display, resolved: true, target: null, resource };
    unresolved.set(baseName, (unresolved.get(baseName) || 0) + 1);
    return { href: null, text: display, resolved: false, target: null };
  }
  let href = `/${target.typeRoute}/${target.slug}`;
  if (anchorPart) href += '#' + new GithubSlugger().slug(anchorPart);
  return { href, text: display, resolved: true, target };
}

for (const p of pages) {
  const outLinks = [];
  const images = [];
  // 0) 去前导空白 + 去掉与页面标题重复的开头 H1
  let md = p.body.replace(/^﻿?\s*/, '').replace(/^#\s+.+\r?\n+/, '');
  // Obsidian 动态块在静态站无法执行：
  //  - chart 代码块 → 内联 SVG（见 src/lib/chart-svg.mjs），保留可视化
  //  - datacards → 标记为待替换（由前端组件处理）
  //  - dataview / mermaid / charted-roots → 折叠提示（仅详情页保留，索引页不显示）
  md = md.replace(/```+chart\n([\s\S]*?)```+/g, (_, body) => renderChartBlock(body));
  // DataCards 替换为特殊标记，前端会用组件替换
  md = md.replace(/```+datacards\n([\s\S]*?)```+/g, (match) => {
    // 提取查询条件
    const whereMatch = match.match(/WHERE\s+([^\n]+)/);
    const where = whereMatch ? whereMatch[1].trim() : '';
    return `<div class="datacards-placeholder" data-where="${where.replace(/"/g, '&quot;')}"></div>`;
  });
  md = md.replace(/```+dataview[\s\S]*?```+/g, '\n<details class="obsidian-note"><summary>📊 Obsidian Dataview 动态查询</summary>此处为动态数据视图，请在 Obsidian 中查看实时结果。</details>\n');
  md = md.replace(/```+mermaid[\s\S]*?```+/g, '\n<details class="obsidian-note"><summary>🧩 Mermaid 流程图</summary>此处为流程图，请在 Obsidian 中查看可视化内容。</details>\n');
  md = md.replace(/```+charted-roots[\s\S]*?```+/g, '\n<details class="obsidian-note"><summary>🌳 Charted Roots 家谱图</summary>此处为家谱图，请在 Obsidian 中查看树状结构。</details>\n');
  const protectedCode = [];
  const stashCode = (match) => {
    const key = `%%HLM_CODE_${protectedCode.length}%%`;
    protectedCode.push(match);
    return key;
  };
  md = md.replace(/```[\s\S]*?```/g, stashCode);
  md = md.replace(/`[^`\n]*`/g, stashCode);
  // 1) 图片 ![[ ]]
  md = md.replace(/!\[\[([^\]]+)\]\]/g, (_, inner) => {
    const raw = inner.split('|')[0].trim();
    const alt = path.basename(raw).replace(/\.[a-z]+$/i, '');
    if (IMAGE_RE.test(raw)) {
      const href = imgHref(raw);
      images.push(href);
      return `![${alt}](${href})`;
    }
    const resource = resolveResource(raw);
    if (resource) return `[${alt}](${resource.href})`;
    return `<span class="wikilink-missing" title="该嵌入资源未发布到本站">${alt}</span>`;
  });
  // 2) 按 ## 小节分段，逐段解析 wikilink（记录所属小节为关系类型）
  const sectionSlugger = new GithubSlugger();
  const segs = md.split(/^(?=##\s)/m);
  md = segs.map(seg => {
    const head = seg.match(/^##\s+(.+?)\s*$/m);
    const relName = head ? head[1].replace(/\s*\{.*\}\s*$/, '').trim() : '';
    return seg.replace(/(?<!\!)\[\[([^\]]+)\]\]/g, (_, inner) => {
      const r = resolveLink(inner, sectionSlugger);
      if (r.target && p.isEntry && r.target.isEntry) {
        outLinks.push({ target: r.target.basename, slug: r.target.slug, type: r.target.type, rel: relName });
      }
      if (r.href) return `[${r.text}](${r.href})`;
      if (r.resolved) return r.text;                       // 页内锚点等
      // 未发布页（整理规则 / Canvas / yaml 等）：标灰并提示，避免出现“可点却无效”的死链
      return `<span class="wikilink-missing" title="该条目未发布到本站（如整理规则 / Canvas / 外部文件）">${r.text}</span>`;
    });
  }).join('');
  md = md.replace(/%%HLM_CODE_(\d+)%%/g, (_, i) => protectedCode[Number(i)] ?? '');

  // 3) md → HTML
  let html = '';
  try { html = String(processor.processSync(md)); }
  catch (err) { warnings.push(`HTML 生成失败 ${p.rel}: ${err.message}`); html = '<p>（内容渲染失败）</p>'; }
  html = html.replace(/<img\b([^>]*)>/g, (tag, attrs) => {
    const lazy = /\sloading=/.test(attrs) ? '' : ' loading="lazy"';
    const decoding = /\sdecoding=/.test(attrs) ? '' : ' decoding="async"';
    return `<img${lazy}${decoding}${attrs}>`;
  });

  // 4) 抓小节（h2/h3）
  const sections = [];
  for (const m of html.matchAll(/<h([23])\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g))
    sections.push({ level: Number(m[1]), id: m[2], text: stripTags(m[3]) });

  p.html = html;
  p.sections = sections;
  p.outLinks = outLinks;
  p.images = images;
  // 封面：首图提取为详情页大图头，并从正文移除避免重复
  p.cover = images[0] || null;
  if (p.cover && /^\s*<p>\s*<img[^>]*>\s*<\/p>/.test(p.html)) {
    p.html = p.html.replace(/^\s*<p>\s*<img[^>]*>\s*<\/p>\s*/, '');
  }
}

// ---------- 人物画像自动关联 ----------
// 扫描 IMG_OUT 下已处理的人物画像，自动添加到对应人物的 images 数组
for (const p of pages) {
  if (p.type !== '人物' || !p.isEntry) continue;
  const assetDir = path.join(IMG_OUT, p.type, 'assets', p.basename);
  if (!fs.existsSync(assetDir)) continue;
  try {
    const files = fs.readdirSync(assetDir);
    const portraits = files
      .filter(f => /_portrait_v\d+\.webp$/i.test(f))
      .sort(); // v1, v2, v3...
    for (const portrait of portraits) {
      const href = imgHref(`知识库/${p.type}/assets/${p.basename}/${portrait}`);
      // 添加到开头（作为主要展示图）
      if (!p.images.includes(href)) {
        p.images.unshift(href);
      }
    }
    // 更新 cover 为第一张图
    if (p.images.length > 0 && !p.cover) {
      p.cover = p.images[0];
    }
  } catch (err) {
    // 读取失败则跳过
  }
}

// ---------- 组装产物 ----------
const fmClean = (fm) => JSON.parse(JSON.stringify(fm)); // Date→ISO 等
const toPage = (p) => ({
  id: p.basename, title: p.title, type: p.type, typeRoute: p.typeRoute,
  kind: p.kind, slug: p.slug, isEntry: p.isEntry, chapterNo: p.chapterNo,
  frontmatter: fmClean(p.fm), sections: p.sections,
  outLinks: p.outLinks, images: p.images, html: p.html, cover: p.cover || null,
});
const allPages = pages.map(toPage);

// graph：词条节点 + 出链边（双端均为词条）
const entryById = new Map(pages.filter(p => p.isEntry).map(p => [p.basename, p]));
const gNodes = pages.filter(p => p.isEntry).map(p => ({
  id: p.basename, slug: p.slug, type: p.type, typeRoute: p.typeRoute, title: p.title,
  family: p.fm['家族'] ?? null, rank: p.fm['册次'] ?? null, home: p.fm['居所'] ?? null,
  role: p.fm['身份'] ?? null,
}));
const edgeMap = new Map();
for (const p of pages) {
  if (!p.isEntry) continue;
  for (const l of p.outLinks) {
    if (!entryById.has(l.target) || l.target === p.basename) continue;
    const key = `${p.basename}__${l.target}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { source: p.basename, target: l.target, rels: new Set(), weight: 0 });
    const e = edgeMap.get(key); e.weight++; if (l.rel) e.rels.add(l.rel);
  }
}
const gEdges = [...edgeMap.values()].map(e => ({ source: e.source, target: e.target, weight: e.weight, rels: [...e.rels] }));

// 派生
const characters = pages.filter(p => p.type === '人物' && p.isEntry).map(p => ({
  id: p.basename, slug: p.slug, title: p.title,
  family: p.fm['家族'] ?? null, role: p.fm['身份'] ?? null, fate: p.fm['结局'] ?? null,
  home: p.fm['居所'] ?? null, rank: p.fm['册次'] ?? null,
  firstChapter: p.fm['首次出现回'] ?? null, verdictKw: p.fm['判词关键词'] ?? null,
}));
const poems = pages.filter(p => p.type === '诗词' && p.isEntry).map(p => ({
  id: p.basename, slug: p.slug, title: p.title,
  poemType: p.fm['诗词类型'] ?? null, owner: p.fm['归属人物'] ?? null,
  chapter: p.fm['出现章节'] ?? null, scene: p.fm['关联场景'] ?? null, kind: p.kind,
}));
const chapters = pages.filter(p => p.type === '章节' && p.chapterNo != null)
  .sort((a, b) => a.chapterNo - b.chapterNo)
  .map(p => ({ id: p.basename, slug: p.slug, title: p.title, no: p.chapterNo }));
const chapterGroups = pages.filter(p => p.type === '章节' && p.chapterNo == null)
  .map(p => ({ id: p.basename, slug: p.slug, title: p.title }));

// fate：判词 → 后四十回应验（抽取人物页「判词 / 后四十回终局回看」小节 HTML 做对照）
const RANK_ORDER = { 正册: 0, 副册: 1, 又副册: 2 };
const grabSection = (html, heading) => {
  const re = new RegExp(`<h2 id="[^"]*">${heading}</h2>([\\s\\S]*?)(?=<h2[ >]|$)`);
  const m = html.match(re);
  return m ? m[1].trim() : '';
};
const fate = pages
  .filter((p) => p.type === '人物' && p.isEntry && p.fm['册次'] && p.fm['册次'] !== '无')
  .sort((a, b) => (RANK_ORDER[a.fm['册次']] ?? 9) - (RANK_ORDER[b.fm['册次']] ?? 9))
  .map((p) => ({
    id: p.basename, slug: p.slug, title: p.title,
    rank: p.fm['册次'] ?? null, verdictKw: p.fm['判词关键词'] ?? null,
    fate: p.fm['结局'] ?? null, family: p.fm['家族'] ?? null, home: p.fm['居所'] ?? null,
    verdict: grabSection(p.html, '判词') || grabSection(p.html, '相关判词'),
    fulfill: grabSection(p.html, '后四十回终局回看') || grabSection(p.html, '命运走向'),
  }));

// 计数报告
const byType = {};
for (const p of pages) byType[p.type] = (byType[p.type] || 0) + 1;
const meta = {
  total: pages.length,
  entries: pages.filter(p => p.isEntry).length,
  byType,
  derived: { characters: characters.length, poems: poems.length, chapters: chapters.length, chapterGroups: chapterGroups.length, fate: fate.length },
  graph: { nodes: gNodes.length, edges: gEdges.length },
  images: imgCount,
  resources: resourceCount,
  unresolved: [...unresolved.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ target: k, count: v })),
  warnings,
};

// ---------- 全库检索索引（dev + 生产均可用，纯前端检索）----------
const SEARCH_FM_KEYS = [
  '别名', '又名', '本名', '字', '号', '判词关键词', '结局', '家族', '身份', '居所',
  '归属人物', '诗词类型', '关联场景', '出现章节', '首次出现回', '册次', '朝代', '作者',
];
const subtitleFor = (p) => {
  const fm = p.fm || {};
  const pick = (...keys) => keys.map((k) => fm[k]).filter(Boolean)
    .map((v) => (Array.isArray(v) ? v.join('、') : String(v)));
  if (p.type === '人物') return pick('家族', '身份', '册次').join(' · ');
  if (p.type === '诗词') return pick('诗词类型', '归属人物').join(' · ');
  if (p.type === '章节') return p.chapterNo != null ? `第${p.chapterNo}回` : '章节';
  return pick('类型').join(' · ') || p.type;
};
const searchIndex = pages.filter((p) => p.isEntry).map((p) => {
  const fm = p.fm || {};
  const kwParts = [];
  for (const k of SEARCH_FM_KEYS) { const v = fm[k]; if (v) kwParts.push(Array.isArray(v) ? v.join(' ') : String(v)); }
  const kw = kwParts.join(' ');
  const secs = (p.sections || []).map((s) => s.text).join(' ');
  const ex = stripTags(p.html).replace(/\s+/g, ' ').trim().slice(0, 110);
  return {
    id: p.basename, t: p.title, ty: p.type, r: p.typeRoute, s: p.slug,
    sub: subtitleFor(p), ex,
    blob: [p.title, kw, secs, ex].join(' ').toLowerCase(),
  };
});
fs.writeFileSync(path.resolve(__dirname, '../public/search-index.json'), JSON.stringify(searchIndex));

// 写出
fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
write('pages.json', allPages);
write('graph.json', { nodes: gNodes, edges: gEdges });
write('characters.json', characters);
write('poems.json', poems);
write('chapters.json', { chapters, groups: chapterGroups });
write('fate.json', fate);
write('meta.json', meta);

// 供 /graph 客户端 fetch 的关系数据
fs.writeFileSync(path.resolve(__dirname, '../public/graph.json'), JSON.stringify({ nodes: gNodes, edges: gEdges }));

// ---------- SEO：sitemap.xml + robots.txt（零依赖，部署用 SITE_URL 覆盖）----------
const SITE_URL = (process.env.SITE_URL || 'https://hongloumeng.example').replace(/\/$/, '');
const staticRoutes = ['/', '/graph', '/fate', '/search', '/characters', '/poems', '/chapters'];
const routeSet = new Set(staticRoutes);
for (const r of new Set(pages.map(p => p.typeRoute))) routeSet.add('/' + r);     // 各类目列表页
for (const p of pages) routeSet.add(`/${p.typeRoute}/${p.slug}`);                // 词条/工具详情页
const urls = [...routeSet].sort();
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${SITE_URL}${u.split('/').map(encodeURIComponent).join('/')}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`;
fs.writeFileSync(path.resolve(__dirname, '../public/sitemap.xml'), sitemap);
fs.writeFileSync(path.resolve(__dirname, '../public/robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// 控制台核对
console.log('===== build:data 完成 =====');
console.log('总页面:', meta.total, '| 词条:', meta.entries);
console.log('类型:', JSON.stringify(byType));
console.log('派生:', JSON.stringify(meta.derived));
console.log('图谱: 节点', meta.graph.nodes, '边', meta.graph.edges);
console.log('图片:', imgCount, `| 体积 ${(imgBytesIn/1048576).toFixed(1)}MB → ${(imgBytesOut/1048576).toFixed(1)}MB`,
  imgBytesIn ? `(降 ${(100*(1-imgBytesOut/imgBytesIn)).toFixed(0)}%)` : '');
console.log('资源:', resourceCount, `| 体积 ${(resourceBytes/1048576).toFixed(1)}MB`);
console.log('未解析出链:', meta.unresolved.length, meta.unresolved.map(u => `${u.target}(${u.count})`).join(' | '));
if (warnings.length) { console.log('⚠️ 警告', warnings.length, '条:'); warnings.slice(0, 20).forEach(w => console.log('  -', w)); }
