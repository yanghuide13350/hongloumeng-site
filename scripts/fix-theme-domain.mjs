// 批量补齐缺 主题域 的 frontmatter（知识库健康检查修复）
// 运行：node site/scripts/fix-theme-domain.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB = path.resolve(__dirname, '../../知识库');
const DRY = process.argv.includes('--dry-run');

const RULES = [
  { dir: path.join(KB, '诗词/单篇'), domains: ['诗词'], match: () => true },
  {
    dir: path.join(KB, '事件'),
    domains: ['事件'],
    match: (f) => path.basename(f).startsWith('事件 - '),
  },
  { dir: path.join(KB, '诗词/场景'), domains: ['诗词', '场景'], match: () => true },
];

const EXTRA = [
  {
    file: path.join(KB, '图表/Charts图表美化技巧.md'),
    domains: ['图表'],
  },
];

function addThemeDomain(file, domains) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.startsWith('---')) return { status: 'skip-no-fm' };
  if (/^主题域:/m.test(content)) return { status: 'skip-has' };

  const block = `主题域:\n${domains.map((d) => `  - ${d}`).join('\n')}\n`;
  const next = content.replace(/^(类型: .+\n)/m, `$1${block}`);
  if (next === content) return { status: 'skip-no-type' };

  if (!DRY) fs.writeFileSync(file, next);
  return { status: 'fixed' };
}

let fixed = 0;
let skipped = 0;

for (const { dir, domains, match } of RULES) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    if (!match(file)) continue;
    const r = addThemeDomain(file, domains);
    if (r.status === 'fixed') fixed++;
    else skipped++;
  }
}

for (const { file, domains } of EXTRA) {
  if (!fs.existsSync(file)) continue;
  const r = addThemeDomain(file, domains);
  if (r.status === 'fixed') fixed++;
  else skipped++;
}

console.log(DRY ? '[dry-run] ' : '', `fixed=${fixed}, skipped=${skipped}`);
