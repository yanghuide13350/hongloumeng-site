# 红楼梦知识库 · 水墨宋式站点

基于 [Astro](https://astro.build) 的静态站点，将 Obsidian 知识库中的 Markdown 词条渲染为可浏览、可检索、可图谱探索的 Web 阅读体验。

**推荐 GitHub 仓库名：** `hongloumeng-site`

---

## 功能概览

| 模块 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` | 水墨宋式视觉、宝黛并立、十二钗头像墙、全库统计 |
| 人物关系网络 | `/graph` | Cytoscape 力导向图谱，词条互链可视化 |
| 命运 · 判词 | `/fate` | 判词曲文与后文应验对照 |
| 诗词鉴赏 | `/poems` | 判词、曲、联句、酒令、灯谜等分类索引 |
| 百二十回脉络 | `/chapters` | 章节分组与单回精读 |
| 词条浏览 | `/characters` 等 | 人物、主题、事件、地点、器物、民俗、线索、图表 |
| 全文搜索 | `/search` | Pagefind 离线搜索 |

---

## 技术栈

- **框架：** Astro 6（纯静态输出）
- **图谱：** Cytoscape + fcose 布局
- **搜索：** Pagefind
- **动画：** GSAP
- **数据管线：** Markdown → JSON（`scripts/build-data.mjs`）
- **图片：** Sharp 转 WebP

---

## 目录结构

```
site/
├── src/
│   ├── pages/          # 路由页面
│   ├── components/     # Astro 组件
│   ├── layouts/        # 页面布局
│   ├── lib/            # 数据读取与工具
│   └── data/           # build:data 生成的 JSON（git 忽略）
├── public/             # 静态资源与搜索索引（部分 git 忽略）
├── scripts/
│   ├── build-data.mjs  # Markdown → JSON 数据管线
│   └── audit-vault.mjs # 知识库健康审计
├── astro.config.mjs
└── package.json
```

---

## 本地开发

### 环境要求

- Node.js 18+
- npm

### 1. 克隆仓库

```bash
git clone https://github.com/<你的用户名>/hongloumeng-site.git
cd hongloumeng-site
npm install
```

### 2. 准备知识库数据（重要）

数据管线默认从**上级目录**读取 Obsidian 知识库：

```
红楼梦知识库/              ← 知识库根目录（不在本仓库内）
├── 知识库/                ← Markdown 词条
├── 红楼梦 索引.md
├── 整理规则/
└── site/                  ← 本仓库（你 clone 的位置应在此）
```

若你只有 `site` 仓库、没有并列的知识库目录，`npm run build:data` 会失败。

**两种使用方式：**

| 场景 | 做法 |
|------|------|
| 维护者本地开发 | 保持 `site/` 在知识库根目录下，运行 `npm run build:data` |
| 仅浏览站点 | 直接使用已部署的线上地址，或本地 `npm run preview` 预览已构建的 `dist/` |

> 生成物（`src/data/*.json`、`public/images/` 等）已在 `.gitignore` 中排除，不会推送到 GitHub。这是刻意设计：仓库只含站点源码，内容数据留在 Obsidian 知识库。

### 3. 生成数据并启动

```bash
npm run build:data   # 从 Obsidian 知识库生成 JSON 与图片
npm run dev          # 开发服务器，默认 http://localhost:4321
```

### 4. 构建与预览

```bash
npm run build        # build:data + astro build → dist/
npm run preview      # 预览 dist/
```

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build:data` | 从 Markdown 生成站点数据 |
| `npm run build` | 生成数据 + 构建静态站 |
| `npm run preview` | 预览构建结果 |
| `npm run audit:vault` | 审计知识库 frontmatter 与链接完整性 |
| `npm run audit:vault:json` | 同上，输出 JSON |

---

## 推送到 GitHub

在 `site/` 目录下执行：

```bash
# 1. 初始化 git（若尚未初始化）
git init

# 2. 添加远程仓库（先在 GitHub 创建名为 hongloumeng-site 的空仓库）
git remote add origin https://github.com/<你的用户名>/hongloumeng-site.git

# 3. 首次提交
git add .
git commit -m "init: 红楼梦知识库静态站点"

# 4. 推送
git branch -M main
git push -u origin main
```

### GitHub 仓库设置建议

- **Name：** `hongloumeng-site`
- **Description：** `红楼梦知识库 · 水墨宋式静态站点（Astro）`
- **Topics：** `hongloumeng`, `dream-of-red-chamber`, `astro`, `static-site`, `chinese-literature`
- **Visibility：** Public 或 Private，按你的需要

---

## 部署

站点为纯静态输出，可部署到 GitHub Pages、Cloudflare Pages、Netlify 等任意静态托管。

### GitHub Pages 示例

1. 在知识库完整环境下本地构建：

```bash
SITE_URL=https://<你的用户名>.github.io/hongloumeng-site npm run build
```

2. 将 `dist/` 内容推送到 `gh-pages` 分支，或使用 GitHub Actions 自动部署。

> 由于构建依赖 Obsidian 知识库，CI 需要在 runner 上能访问知识库内容（例如私有 submodule），或在本地构建后只上传 `dist/`。

---

## 数据管线说明

`scripts/build-data.mjs` 读取：

- `../知识库/**/*.md` — 词条正文
- `../红楼梦 索引.md` — 总索引
- 各目录 `assets/` — 图片（转 WebP 输出到 `public/images/`）

输出：

- `src/data/*.json` — 页面、图谱、统计等结构化数据
- `public/graph.json`、`public/search-index.json` — 图谱与搜索索引
- `public/sitemap.xml`、`public/robots.txt` — SEO

修改 Obsidian 笔记后，重新运行 `npm run build:data` 即可更新站点内容。

---

## License

内容与站点代码的授权方式请按你的实际需要补充。
