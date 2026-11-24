# 峰谷提醒 · 梁文峰 / 梁文谷

[![CI](https://github.com/LiuLi-Kuang/dsh-liang-feng-gu/actions/workflows/ci.yml/badge.svg)](https://github.com/LiuLi-Kuang/dsh-liang-feng-gu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![English README](https://img.shields.io/badge/readme-English-blue)](README.en.md)

[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart)（DSH）插件：在会话 header 右侧挂一枚小徽标，实时显示**当前 API 计价是峰还是谷**——峰时叫「梁文峰」，谷时叫「梁文谷」（梗：峰谷定价上线后网友对高峰/空闲时段的称呼）。鼠标悬停看切换倒计时、价格口径、生效的节假日表，外加一句省 token 小技巧。

| 时段 | 徽标 | 颜色 |
|---|---|---|
| 周一至周五 09:00–12:00、14:00–18:00（法定节假日除外） | **梁文峰** | 琥珀 |
| 其余全部时间（午休 12:00–14:00、夜间、周末、法定节假日） | **梁文谷** | 青绿 |

中国法定节假日与调休表**每次启动自动同步**（当年 + 次年），不用等插件发版；断网时自动回退到本地缓存和内置表。想先看长什么样，clone 后双击 `preview.html`。

## 安装

**方式一：界面安装（推荐）**

```powershell
git clone https://github.com/LiuLi-Kuang/dsh-liang-feng-gu.git
```

1. 左侧栏 → **插件（Plugins）** → **添加插件**
2. 填 clone 出来的本地绝对路径（就是本目录）
3. 安装 → 按提示刷新页面（`Ctrl+R`）

**方式二：命令行**

```powershell
dsh plugin add <本目录的绝对路径>
```

插件是 `link:` 方式挂进 profile 的：改 `client.js` 后刷新页面即生效；改 `entry.js`（Host 半侧）后需要**重启 DSH**。

## 语言

**默认跟随系统语言**：读浏览器的 `navigator.languages`，`zh-*` 显示中文、`en-*` 显示 English，其余语言回落 English。两种语言下徽标都显示「梁文峰 / 梁文谷」——这俩名字是梗本身，翻译了就不好玩了；跟随语言切换的是悬浮卡、倒计时、时段说明等全部其余文案。

想固定语言（比如中文系统想看英文界面），在 DSH 页面的控制台执行一次后刷新：

```js
localStorage.setItem('dsh-liang-feng-gu:locale', 'en')   // 或 'zh'
```

文案表在 `client.js` 的 `STRINGS`（zh / en 两份，含各自的时长、日期、aria 格式化函数）。

## 判定规则（官方口径）

来自 DeepSeek API 价格页脚注 2，[原文](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)：

> 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。

- **高峰**：北京时间，周一至周五 `09:00–12:00`、`14:00–18:00`（法定节假日除外），价格为空闲时段的 2 倍
- **空闲**：其余全部时间，价格为高峰的一半
- 计价**自动按请求发生的时刻**判定，无需任何开关
- 口径是「周几」而不是「上不上班」：**调休上班的周六周日仍按周末算，全天谷价**
- 时间一律按北京时间（固定 UTC+8）计算，与系统时区无关

## 节假日自动同步

```
浏览器半侧 client.js ──GET /plugins/liang-feng-gu/holidays?year=YYYY──▶ Host 半侧 entry.js ──fetch──▶ timor.tech
```

- **时机**：每次打开页面同步一次（当年 + 次年），之后每 6 小时再拉一次
- **Host 路由**：`entry.js` 在 DSH 的内置 web server 上注册本地路由，代理上游、内存缓存 6 小时——浏览器侧是同源请求，完全没有 CORS 问题
- **回退链**：本地路由 → `localStorage` 上次结果 → 内置 2026 表；上游挂了/断网都不影响徽标显示
- **可见性**：悬浮卡「数据」行显示当前生效的年份与同步时间，比如 `2026 / 2027 · 11-24 已同步`
- **换源**：默认上游 [timor.tech](https://timor.tech/api/holiday/)（社区维护，跟随国务院通知）。要自建镜像或换源，在 `cordis.patch.yml` 的行上加 config：

  ```yaml
  - insert:
      - id: liang-feng-gu
        name: '@local/dsh-liang-feng-gu'
        config:
          upstream: 'https://your-mirror.example/holiday/year/'   # 末尾会拼上年份
          timeoutMs: 8000
  ```

> **免责声明**：节假日数据来自社区维护的 timor.tech，非官方源，以国务院办公厅每年通知为准。本插件只做提醒，不影响实际计费——价格由 DeepSeek 按请求时刻真实计价。

## 自检 / 开发

```powershell
npm test        # node scripts/verify.mjs，零依赖，Node 18+
```

`scripts/verify.mjs` 会把 `client.js` 里 `#region core` 标记之间的纯逻辑抠出来跑约 55 项断言（窗口边界、节假日/调休、次年退回规则、上游归一化、切换时刻计算、中英文文案等）。CI（`.github/workflows/ci.yml`）在每次 push / PR 时跑同一份脚本。

| 想改什么 | 改哪里 |
|---|---|
| 峰时时段 | `client.js` 的 `inPeakWindow()`（`540` = 09:00，`720` = 12:00，`840` = 14:00，`1080` = 18:00） |
| 内置兜底节假日 | `client.js` 的 `HOLIDAYS_2026` / `MAKEUP_2026` |
| 上游 / 超时 | `cordis.patch.yml` 的 `config.upstream` / `config.timeoutMs`（或 `entry.js` 里的默认值） |
| 同步频率 | `client.js` 的 `SYNC_INTERVAL_MS` |
| 徽标刷新频率 | `client.js` 组件里的 `setInterval(..., 15000)` |
| 配色 / 卡片样式 | `client.js` 的 `STYLE`（深色在 `body[data-ds-dark-theme]` 那几段） |
| 文案（中/英） | `client.js` 的 `STRINGS` |

改 core 逻辑后跑 `npm test`；`#region` 标记之间的代码不要碰 `window` / `document`（测试要无头执行）。

## 目录结构

```
dsh-liang-feng-gu/
├─ entry.js               Host 半侧：本地路由代理节假日 API（含缓存与换源配置）
├─ client.js              浏览器半侧：峰谷判定（#region core）+ 徽标 + 悬浮卡 + 启动同步
├─ scripts/verify.mjs     离线自检（npm test）
├─ cordis.patch.yml       把本包插进 profile 组合树的那一行
├─ locale/{zh,en}.json    插件页显示的标题和描述
├─ preview.html           静态预览（双击用浏览器打开，无需安装）
├─ icon.svg               插件图标（峰谷折线）
├─ package.json           dsh.bundle / dsh.client 元数据
└─ .github/workflows/ci.yml
```

## 已知限制

- 徽标挂在会话 header 席位（`conversation.session.header.utilities`）：**没有打开会话时**（纯启动页）不显示。
- 依赖本机时钟；系统时间不对，判定跟着不对。
- 断网且从未同步成功过时，内置表只覆盖 2026 年，其余年份退回「周一至周五算峰」的周几规则。
- 调休表仅用于悬浮卡文案（官方口径按周几判峰，调休周六周日仍是谷）。

## License

[MIT](LICENSE)

## 数据与参考

- [DeepSeek 模型 & 价格（脚注 2 为峰谷时段口径）](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- [timor.tech 节假日 API（上游数据源）](https://timor.tech/api/holiday/)
- [国务院办公厅关于 2026 年部分节假日安排的通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)
