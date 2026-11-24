# Peak / Valley Badge for DeepSeek Harness · 梁文峰 / 梁文谷

[![CI](https://github.com/LiuLi-Kuang/dsh-liang-feng-gu/actions/workflows/ci.yml/badge.svg)](https://github.com/LiuLi-Kuang/dsh-liang-feng-gu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![中文 README](https://img.shields.io/badge/readme-中文-blue)](README.md)

A [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart) (DSH) plugin: a small badge in the conversation header tells you whether DeepSeek API pricing is currently at **peak or off-peak** — peak shows 梁文峰, off-peak shows 梁文谷 (the community's nicknames after time-of-day pricing launched). Hover for the switch countdown, the pricing rule, the holiday calendar in use, and a token-saving tip.

| Window | Badge | Color |
|---|---|---|
| Mon–Fri 09:00–12:00, 14:00–18:00 (excl. Chinese public holidays) | **梁文峰** (peak) | amber |
| Everything else (lunch break, nights, weekends, public holidays) | **梁文谷** (off-peak) | teal |

The Chinese public-holiday / make-up-workday calendar is **fetched automatically on every startup** (current + next year), so no plugin release is needed when next year's schedule is announced. Offline it falls back to a local cache and a built-in 2026 table. See `preview.html` for a static look without installing.

## Install

```powershell
git clone https://github.com/LiuLi-Kuang/dsh-liang-feng-gu.git
```

1. Sidebar → **Plugins** → **Add plugin**
2. Paste the absolute path of the cloned folder
3. Install → refresh the page (`Ctrl+R`)

Or via CLI: `dsh plugin add <path>`.

The plugin is linked into your profile: edits to `client.js` apply on page refresh; edits to `entry.js` (the host half) require a DSH restart.

## Language

**Follows the system language by default**: the browser's `navigator.languages` is read — `zh-*` gets Chinese, `en-*` gets English, anything else falls back to English. In both languages the badge itself shows 梁文峰 / 梁文谷 — those names are the joke, translating them would miss the point; everything else (hover card, countdown, window descriptions) is localized.

To pin a language (e.g. view English on a Chinese system), run this once in the DSH page console and refresh:

```js
localStorage.setItem('dsh-liang-feng-gu:locale', 'en')   // or 'zh'
```

String tables live in `STRINGS` inside `client.js` (zh / en, each with its own span/date/aria formatters).

## Pricing rule (official)

From footnote 2 of the [official pricing page](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) — Beijing time (UTC+8):

- **Peak**: Mon–Fri `09:00–12:00` and `14:00–18:00`, excluding Chinese public holidays; twice the off-peak price.
- **Off-peak**: all remaining time (including the 12:00–14:00 lunch break, nights, weekends, and public holidays); 50% of the peak price.
- Billing is automatic per request timestamp — the badge is a reminder, not a switch.
- The rule is by **day of week, not by working day**: make-up workdays that fall on Saturday/Sunday still count as off-peak.

## Holiday auto-sync

```
browser half (client.js) ──GET /plugins/liang-feng-gu/holidays?year=YYYY──▶ host half (entry.js) ──fetch──▶ timor.tech
```

- Runs on every page load (current + next year), then every 6 hours.
- The host half registers a local route on DSH's built-in web server: same-origin, no CORS, 6-hour in-memory cache.
- Fallback chain: local route → `localStorage` cache → built-in 2026 table. Outages never break the badge.
- The hover card's `数据` (data) row shows which calendar is in effect.
- Upstream is [timor.tech](https://timor.tech/api/holiday/) (community-maintained, follows State Council notices). Override via the bundle row config: `config.upstream` / `config.timeoutMs` in `cordis.patch.yml`.

> **Disclaimer**: holiday data comes from a community API, not an official feed; the State Council's annual notice is authoritative. This plugin only informs — actual billing is done by DeepSeek per request.

## Tests / development

```powershell
npm test    # node scripts/verify.mjs — zero dependencies, Node 18+
```

`scripts/verify.mjs` extracts the pure logic between the `#region core` markers in `client.js` and runs ~55 assertions (window boundaries, holidays/make-up days, missing-year fallback, upstream payload normalization, switch-time computation, zh/en strings). CI runs the same script on every push/PR.

Keep the `#region` markers intact and free of `window`/`document` references — tests execute that block headless. See the Chinese [README](README.md) for a table of what-to-edit-where.

## Known limitations

- The badge lives in the conversation header slot, so it doesn't render on the session-less home screen.
- It trusts the local clock.
- With no network and no prior sync, the built-in table covers 2026 only; other years fall back to the plain weekday rule.

## License

[MIT](LICENSE)
