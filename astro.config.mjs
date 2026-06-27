import { defineConfig } from 'astro/config';

// 红楼梦知识库 · 静态站
// 纯静态输出，内容为主、交互为辅（cytoscape / pagefind 以 island/script 局部加载）
// 站点 URL：部署时用环境变量 SITE_URL 覆盖（与 scripts/build-data.mjs 的 sitemap 保持一致）
const SITE_URL = process.env.SITE_URL || 'https://hongloumeng.example';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
