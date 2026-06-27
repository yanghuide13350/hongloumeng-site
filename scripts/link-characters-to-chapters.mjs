#!/usr/bin/env node
/**
 * 人物页「关键章节」→ 章节页「相关页面」反向回链
 * 扫描 知识库/人物/ 中含 章节总览 - 第N回 的链接，补入对应章节页
 * 运行：node site/scripts/link-characters-to-chapters.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const CHAR_DIR = path.join(ROOT, '知识库/人物');
const CH_DIR = path.join(ROOT, '知识库/章节');
const DRY = process.argv.includes('--dry-run');

// chapterNum -> Set of character link strings
const chapterToChars = {};

for (const f of fs.readdirSync(CHAR_DIR)) {
  if (!f.endsWith('.md') || f === '人物总表.md') continue;
  const charPage = f.replace(/\.md$/, '');
  const charLink = `[[${charPage}]]`;
  const text = fs.readFileSync(path.join(CHAR_DIR, f), 'utf8');

  // 只在关键章节、名场面、首次出现等结构化区域扫描，避免全文误匹配
  const sections = text.split(/^## /m).slice(1);
  const relevant = sections.filter(s =>
    /^(关键章节|名场面|首次出现|相关章节|命运走向)/.test(s)
  );
  const scanText = relevant.length ? relevant.join('\n') : text;

  for (const m of scanText.matchAll(/\[\[章节总览 - 第(\d+)回\]\]/g)) {
    const n = +m[1];
    chapterToChars[n] = chapterToChars[n] || new Set();
    chapterToChars[n].add(charLink);
  }
}

let updated = 0, skipped = 0;

for (const [nStr, chars] of Object.entries(chapterToChars)) {
  const n = +nStr;
  const chFile = path.join(CH_DIR, `章节总览 - 第${n}回.md`);
  if (!fs.existsSync(chFile)) continue;

  let text = fs.readFileSync(chFile, 'utf8');
  const relatedMatch = text.match(/## 相关页面\n([\s\S]*?)(?=\n## |$)/);
  if (!relatedMatch) continue;

  const existing = relatedMatch[1];
  const toAdd = [...chars].filter(c => !existing.includes(c));
  if (toAdd.length === 0) { skipped++; continue; }

  const addition = toAdd.map(c => `- ${c}`).join('\n');
  text = text.replace(
    /(## 相关页面\n[\s\S]*?)(?=\n## |$)/,
    `$1${existing.endsWith('\n') ? '' : '\n'}${addition}\n`
  );

  if (!DRY) fs.writeFileSync(chFile, text, 'utf8');
  updated++;
}

console.log(DRY ? '[dry-run] ' : '', `chapters updated: ${updated}, skipped (no new links): ${skipped}`);
console.log(`character→chapter mappings scanned: ${Object.keys(chapterToChars).length} chapters`);
