#!/usr/bin/env node
/**
 * 章节页互链冲刺：批量增补 承上启下 / 本回诗词 / 关联事件·地点
 * 跳过已有 ## 承上启下 的页面（已手工沉淀）
 * 运行：node site/scripts/enrich-chapters.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const CH_DIR = path.join(ROOT, '知识库/章节');
const POEM_INDEX = path.join(ROOT, '知识库/诗词/诗词条目总索引.md');
const EVENT_TABLE = path.join(ROOT, '知识库/事件/事件总表.md');
const LOC_DIR = path.join(ROOT, '知识库/地点');
const POEM_SINGLE = path.join(ROOT, '知识库/诗词/单篇');
const SCENE_DIR = path.join(ROOT, '知识库/诗词/场景');

const DRY = process.argv.includes('--dry-run');

// ---------- 诗词单篇名映射 ----------
const poemPageMap = {};
for (const f of fs.readdirSync(POEM_SINGLE)) {
  if (!f.endsWith('.md')) continue;
  const base = f.replace(/\.md$/, '').replace(/^诗词 - /, '');
  poemPageMap[base] = `[[诗词 - ${base}]]`;
}
// 标题别名 → 单篇页
const TITLE_ALIASES = {
  '《葬花吟》': '葬花吟',
  '葬花吟': '葬花吟',
  '黛玉《题帕三绝》': '题帕三绝',
  '《秋窗风雨夕》': '秋窗风雨夕',
  '秋窗风雨夕': '秋窗风雨夕',
  '芙蓉女儿诔': '芙蓉女儿诔',
  '宝玉《芙蓉女儿诔》': '芙蓉女儿诔',
  '凹晶馆中秋联句（黛玉、湘云联，妙玉续）': '凹晶馆联句',
  '姽婳词': '姽婳词 - 宝玉',
  '宝玉《姽婳词》': '姽婳词 - 宝玉',
  '桃花行': '桃花行',
  '《桃花行》': '桃花行',
  '好了歌': '好了歌',
  '好了歌解': '好了歌',
  '警幻仙姑赋': '警幻仙姑赋',
  '石上偈': '石上偈',
  '西江月二词': '西江月二词',
  '咏白海棠': '咏白海棠 - 宝钗',
  '螃蟹咏': '螃蟹咏 - 宝钗',
};

function poemLink(title) {
  const t = title.replace(/^[《]|》$/g, '').trim();
  if (TITLE_ALIASES[title]) return poemPageMap[TITLE_ALIASES[title]] || `[[诗词 - ${TITLE_ALIASES[title]}]]`;
  for (const [alias, key] of Object.entries(TITLE_ALIASES)) {
    if (title.includes(alias.replace(/[《》]/g, ''))) return poemPageMap[key] || `[[诗词 - ${key}]]`;
  }
  // 判词
  const m = title.match(/(.+?)判词/);
  if (m) {
    const name = m[1].trim();
    const key = `判词 - ${name}`;
    if (poemPageMap[key]) return poemPageMap[key];
  }
  // 曲文
  const curves = ['终身误','枉凝眉','恨无常','分骨肉','乐中悲','世难容','喜冤家','虚花悟','聪明累','留余庆','晚韶华','好事终','飞鸟各投林','红楼梦引子'];
  for (const c of curves) {
    if (title.includes(c)) return poemPageMap[c] || `[[诗词 - ${c}]]`;
  }
  return null;
}

// ---------- 解析诗词索引表 ----------
function parsePoemIndex() {
  const text = fs.readFileSync(POEM_INDEX, 'utf8');
  const byChapter = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('| 第')) continue;
    const cols = line.split('|').map(s => s.trim()).filter(Boolean);
    if (cols.length < 6) continue;
    const chMatch = cols[0].match(/第(\d+)回/);
    if (!chMatch) continue;
    const n = +chMatch[1];
    byChapter[n] = byChapter[n] || [];
    byChapter[n].push({
      title: cols[1],
      type: cols[2],
      author: cols[3],
      link: cols[6]?.match(/\[\[([^\]|]+)/)?.[1] || '',
    });
  }
  return byChapter;
}

// ---------- 解析事件表 ----------
function parseEvents() {
  const text = fs.readFileSync(EVENT_TABLE, 'utf8');
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.includes('事件 | 章节')) continue;
    const cols = line.split('|').map(s => s.trim()).filter(Boolean);
    if (cols.length < 4 || !cols[3].startsWith('[[')) continue;
    const name = cols[0];
    const chapters = cols[1];
    const role = cols[2];
    const page = cols[3].match(/\[\[([^\]]+)\]\]/)?.[1];
    if (!page) continue;
    events.push({ name, chapters, role, page });
  }
  return events;
}

function chapterInEvent(ch, chaptersStr) {
  // 第4回 / 第11-12回 / 第6 / 39-42 / 113-119回
  const parts = chaptersStr.replace(/回/g, '').split(/[\/、,，]/);
  for (const p of parts) {
    const t = p.trim();
    const range = t.match(/第?(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (ch >= a && ch <= b) return true;
    } else {
      const single = t.match(/第?(\d+)/);
      if (single && +single[1] === ch) return true;
    }
  }
  return false;
}

function eventRole(ch, chaptersStr, event) {
  const parts = chaptersStr.replace(/回/g, '').split(/[\/、,，]/);
  for (const p of parts) {
    const t = p.trim();
    const range = t.match(/第?(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (ch >= a && ch <= b) {
        if (ch === a && ch === b) return '主场';
        if (ch === a) return '发动';
        if (ch === b) return '收束';
        return '进行中';
      }
    } else {
      const single = t.match(/第?(\d+)/);
      if (single && +single[1] === ch) return '相关';
    }
  }
  return '相关';
}

// ---------- 解析地点页 ----------
function parseLocations() {
  const byChapter = {};
  for (const f of fs.readdirSync(LOC_DIR)) {
    if (!f.endsWith('.md') || f === '地点总表.md') continue;
    const text = fs.readFileSync(path.join(LOC_DIR, f), 'utf8');
    const pageName = f.replace(/\.md$/, '');
    const link = `[[${pageName}]]`;
    for (const m of text.matchAll(/第(\d+)回/g)) {
      const n = +m[1];
      byChapter[n] = byChapter[n] || [];
      if (!byChapter[n].find(x => x.page === link)) {
        byChapter[n].push({ page: link, name: pageName.replace('地点 - ', '') });
      }
    }
  }
  return byChapter;
}

// ---------- 场景页按回次 ----------
function parseScenes() {
  const byChapter = {};
  for (const f of fs.readdirSync(SCENE_DIR)) {
    if (!f.endsWith('.md')) continue;
    const fm = fs.readFileSync(path.join(SCENE_DIR, f), 'utf8');
    const m = fm.match(/出现章节:\s*第(\d+)回/);
    if (m) {
      const n = +m[1];
      const page = `[[${f.replace(/\.md$/, '')}]]`;
      byChapter[n] = byChapter[n] = byChapter[n] || [];
      if (!byChapter[n].find(x => x.page === page))
        byChapter[n].push({ page, name: f.replace('场景 - ', '').replace('.md', '') });
    }
  }
  return byChapter;
}

function volLink(n) {
  if (n <= 5) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第1-5回]]';
  if (n <= 10) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第6-10回]]';
  if (n <= 20) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第11-20回]]';
  if (n <= 40) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第21-40回]]';
  if (n <= 60) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第41-60回]]';
  if (n <= 80) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第61-80回]]';
  if (n <= 100) return '[[知识库/诗词/全书诗词全集/诗词全集 - 第81-100回]]';
  return '[[知识库/诗词/全书诗词全集/诗词全集 - 第101-120回]]';
}

function buildPoemSection(n, poems) {
  if (!poems || poems.length === 0) {
    return '本回无诗作。';
  }
  // 优先列出有名篇单页的
  const important = poems.filter(p => poemLink(p.title));
  const lines = [];
  if (poems.length > 8) {
    const names = important.slice(0, 6).map(p => {
      const lk = poemLink(p.title);
      return lk ? `${p.title} → ${lk}` : p.title;
    });
    lines.push(`本回共 ${poems.length} 条诗性文本。名篇：${names.join('、') || poems.slice(0, 4).map(p => p.title).join('、')}。`);
    lines.push(`> 全表见 ${volLink(n)} 或 [[诗词条目总索引]]。`);
    return lines.join('\n');
  }
  lines.push('| 名称 | 作者 | 页面 |');
  lines.push('|------|------|------|');
  for (const p of poems) {
    const lk = poemLink(p.title) || volLink(n);
    const author = p.author.replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, '$1').replace(/知识库\/人物\/人物 - /g, '').slice(0, 20);
    lines.push(`| ${p.title} | ${author} | ${lk} |`);
  }
  return lines.join('\n');
}

function buildEventLocationSection(n, events, locations, scenes) {
  const rows = [];
  for (const e of events) {
    if (chapterInEvent(n, e.chapters)) {
      rows.push(`| 事件 | [[${e.page}]] | ${eventRole(n, e.chapters, e)} |`);
    }
  }
  for (const s of (scenes[n] || [])) {
    rows.push(`| 场景 | ${s.page} | 诗词主场 |`);
  }
  for (const l of (locations[n] || [])) {
    rows.push(`| 地点 | ${l.page} | 本回出现 |`);
  }
  if (rows.length === 0) return '本回无已建事件页 / 地点页直接对应；见相关人物与主题链接。';
  return ['| 类型 | 页面 | 本回角色 |', '|------|------|----------|', ...rows].join('\n');
}

function build承上启下(n, oneLiner) {
  const prev = n > 1 ? `[[章节总览 - 第${n - 1}回]]` : '无（全书开篇）';
  const next = n < 120 ? `[[章节总览 - 第${n + 1}回]]` : '无（全书收束）';
  return `上承：${prev}。下接：${next}。\n\n本回要点：${oneLiner}`;
}

function enrichFile(filePath, n, poems, events, locations, scenes) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.includes('## 承上启下')) {
    return { skipped: true, n };
  }

  const oneLinerMatch = text.match(/## 一句回评\n(.+)/);
  const oneLiner = oneLinerMatch ? oneLinerMatch[1].trim() : '见剧情推进。';

  const insert = [
    '',
    '## 承上启下',
    build承上启下(n, oneLiner),
    '',
    '## 本回诗词',
    buildPoemSection(n, poems[n]),
    '',
    '## 关联事件·地点',
    buildEventLocationSection(n, events, locations, scenes),
    '',
  ].join('\n');

  // 在 关键伏笔 之后、相关页面/建议互链 之前插入
  const anchor = text.match(/## (相关页面|建议互链)/);
  if (!anchor) return { error: true, n, msg: 'no anchor' };

  text = text.replace(/(## 关键伏笔[\s\S]*?)(\n## (?:相关页面|建议互链))/,
    `$1\n${insert}$2`);

  // 统一建议互链 → 相关页面
  text = text.replace(/## 建议互链/g, '## 相关页面');

  // 更新 frontmatter 时间
  text = text.replace(/更新时间: \d{4}-\d{2}-\d{2}/, '更新时间: 2026-06-23');

  if (!DRY) fs.writeFileSync(filePath, text, 'utf8');
  return { updated: true, n };
}

// ---------- main ----------
const poems = parsePoemIndex();
const events = parseEvents();
const locations = parseLocations();
const scenes = parseScenes();

let updated = 0, skipped = 0, errors = 0;
for (let n = 1; n <= 120; n++) {
  const f = path.join(CH_DIR, `章节总览 - 第${n}回.md`);
  if (!fs.existsSync(f)) { errors++; continue; }
  const r = enrichFile(f, n, poems, events, locations, scenes);
  if (r.skipped) skipped++;
  else if (r.updated) updated++;
  else if (r.error) errors++;
}

console.log(DRY ? '[dry-run] ' : '', `updated: ${updated}, skipped: ${skipped}, errors: ${errors}`);
