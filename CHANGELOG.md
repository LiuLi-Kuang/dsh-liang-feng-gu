# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号语义化。

## 1.2.0 — 2026-11-24

### 新增

- **中英双语，默认跟随系统语言**：读 `navigator.languages`，`zh-*` 中文、`en-*` English、
  其余回落 English；徽标名字「梁文峰 / 梁文谷」两种语言下都保留原样（梗本身不翻译）。
- 手动固定语言：控制台执行 `localStorage.setItem('dsh-liang-feng-gu:locale', 'en')`（或 `'zh'`）后刷新。
- 时长、日期、无障碍文案按语言各自格式化（`3 小时 10 分` / `3h 10m`，`11-24` / `Nov 24`）。
- 悬浮卡标签列加宽到 40px，容纳英文 `Switch` 标签。
- 自检新增 16 项中英文文案断言（`npm test`）。

## 1.1.0 — 2026-11-24

### 新增

- **节假日表启动自动同步**：每次打开页面拉取当年 + 次年日历（默认上游
  [timor.tech](https://timor.tech/api/holiday/)，跟随国务院通知），之后每 6 小时再拉一次。
  - Host 半侧新增本地路由 `GET /plugins/liang-feng-gu/holidays?year=YYYY` 代理上游
    （同源请求、无 CORS 问题、内存缓存 6 小时，`config.upstream` / `config.timeoutMs` 可覆盖）；
  - 浏览器半侧回退链：本地路由 → `localStorage` 上次结果 → 内置 2026 表，断网也能用；
  - 悬浮卡新增「数据」行显示当前生效的表与同步时间；表更新即时刷新徽标。
- `scripts/verify.mjs` 离线自检（`npm test`，无依赖），GitHub Actions CI 同步运行。
- 开源配套：MIT LICENSE、中英 README、CHANGELOG、`.gitignore`。

### 修复（自 1.0.x 一并保留）

- 悬浮卡实色背景（此前用主题半透明 token，正文透上来）。
- 悬浮卡经 `createPortal` 挂到 `document.body`，并复位 `white-space` / 字重，
  修复文字不换行溢出边框的问题。

## 1.0.1 — 2026-11-12

- 悬浮卡改实色背景（原来用 `--dsw-specific-menu`，是半透明色）。
- 卡片经 `createPortal` 挂到 body，CSS 复位 `nowrap` / 600 字重，修文字溢出。

## 1.0.0 — 2026-11-12

- 首版：会话 header 峰谷徽标（梁文峰 / 梁文谷）+ 切换倒计时 + 省 token 小贴士，
  节假日按内置 2026 表判定。
