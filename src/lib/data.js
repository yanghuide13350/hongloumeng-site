// 站点数据读取与辅助（构建时在 Node 环境执行，单次加载）
import fs from 'node:fs';
import path from 'node:path';

// 数据由 `npm run build:data` 生成于 src/data；构建/开发进程 cwd 均为 site 根
const dir = path.join(process.cwd(), 'src', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const pages = load('pages.json');
export const graph = load('graph.json');
export const characters = load('characters.json');
export const poems = load('poems.json');
export const chaptersData = load('chapters.json');
export const fate = load('fate.json');
export const meta = load('meta.json');

// 路由 → 中文标签
export const TYPE_LABEL = {
  characters: '人物', poems: '诗词', chapters: '章节', themes: '主题',
  clues: '线索', places: '地点', events: '事件', objects: '器物',
  folklore: '民俗', charts: '图表', guide: '导览', misc: '其它',
};
// 导航/列表展示顺序
export const TYPE_ORDER = ['characters', 'poems', 'chapters', 'themes', 'clues', 'places', 'events', 'objects', 'folklore', 'charts'];

// 一句话副题（列表页/导航用）
export const TYPE_TAGLINE = {
  characters: '金陵群芳 · 九十五人', poems: '判词曲文 · 诗社联句', chapters: '百二十回脉络',
  themes: '命运 · 女性 · 兴衰', clues: '判词 · 太虚 · 通灵', places: '大观园内外',
  events: '十五桩关键情节', objects: '金锁 · 通灵 · 风月鉴', folklore: '岁时 · 礼俗 · 制度',
  charts: '关系图 · 命运速查',
};

const _byRoute = new Map();
for (const p of pages) {
  if (!_byRoute.has(p.typeRoute)) _byRoute.set(p.typeRoute, []);
  _byRoute.get(p.typeRoute).push(p);
}

export const byRoute = (route) => _byRoute.get(route) ?? [];
export const entriesByRoute = (route) => byRoute(route).filter((p) => p.isEntry);
export const toolsByRoute = (route) => byRoute(route).filter((p) => !p.isEntry);
export const findPage = (route, slug) => byRoute(route).find((p) => p.slug === slug);

const _byId = new Map(pages.map((p) => [p.id, p]));
export const pageById = (id) => _byId.get(id);
export const urlOf = (p) => `/${p.typeRoute}/${p.slug}`;

// 各 route 词条计数（导航徽标）
export const countByRoute = Object.fromEntries(
  TYPE_ORDER.map((r) => [r, entriesByRoute(r).length])
);

// 节点局部邻居（详情页关系侧栏小图）
const _nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
export function neighborsOf(id, limit = 14) {
  const acc = new Map();
  for (const e of graph.edges) {
    if (e.source === id) acc.set(e.target, (acc.get(e.target) || 0) + e.weight);
    else if (e.target === id) acc.set(e.source, (acc.get(e.source) || 0) + e.weight);
  }
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([nid, w]) => ({ node: _nodeById.get(nid), weight: w }))
    .filter((x) => x.node);
}

// 家族 → 配色（图谱着色）：与客户端 island 共享同一份，见 src/lib/color.js
export { FAMILY_COLOR, familyColor } from './color.js';
