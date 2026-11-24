#!/usr/bin/env node
/**
 * 离线自检：把 client.js 里两个 region 标记之间的纯逻辑抠出来直接跑断言。
 * 不需要 DOM、不需要 React、不需要网络 —— Node 18+ 直接跑：
 *
 *   node scripts/verify.mjs     （或 npm test）
 *
 * 给 client.js 的 core 区块加东西时记得保持两个标记不动，也别在标记之间
 * 碰 window / document —— 这里的抽取靠的就是 core 不依赖浏览器环境。
 */

import { readFile } from 'node:fs/promises'

const CORE_START = '/* #region core */'
const CORE_END = '/* #endregion core */'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf(CORE_START)
const end = source.indexOf(CORE_END)
if (start < 0 || end < 0 || end <= start) {
  throw new Error('core region not found — keep the #region markers in client.js intact')
}
if (source.indexOf(CORE_START) !== source.lastIndexOf(CORE_START)) {
  throw new Error('duplicate #region core marker in client.js')
}

const body = source.slice(start + CORE_START.length, end)
if (/\bwindow\b|\bdocument\b/.test(body)) {
  throw new Error('core region must not reference window/document — it runs headless in tests')
}

const factory = new Function(
  `${body}\n;return { classify, nextSwitch, humanSpan, dayLine, snapshot, normalizePayload, applyHolidayData, resetHolidayData, subscribe, setLocale, BUILTIN_DAYS }`,
)
const api = factory()

/** 北京时间 YYYY-MM-DD HH:mm 对应的 epoch ms。 */
const B = 8 * 3600 * 1000
const at = (year, month, day, hour = 0, minute = 0) =>
  Date.UTC(year, month - 1, day, hour, minute) - B

let ran = 0
let failed = 0
const check = (label, actual, expected) => {
  ran += 1
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failed += 1
    console.error(`  x ${label}: expected ${e}, got ${a}`)
  } else {
    console.log(`  . ${label}`)
  }
}

console.log('classify — 窗口边界（左闭右开）')
check('2026-11-12 周四 14:50 → peak', api.classify(at(2026, 11, 12, 14, 50)).phase, 'peak')
check('2026-11-12 周四 09:00 整点起峰', api.classify(at(2026, 11, 12, 9, 0)).phase, 'peak')
check('2026-11-12 周四 11:59 仍在峰', api.classify(at(2026, 11, 12, 11, 59)).phase, 'peak')
check('2026-11-12 周四 12:00 午休转谷', api.classify(at(2026, 11, 12, 12, 0)).phase, 'valley')
check('2026-11-12 周四 13:59 谷', api.classify(at(2026, 11, 12, 13, 59)).phase, 'valley')
check('2026-11-12 周四 14:00 起峰', api.classify(at(2026, 11, 12, 14, 0)).phase, 'peak')
check('2026-11-12 周四 17:59 仍在峰', api.classify(at(2026, 11, 12, 17, 59)).phase, 'peak')
check('2026-11-12 周四 18:00 转谷', api.classify(at(2026, 11, 12, 18, 0)).phase, 'valley')
check('2026-11-13 周五 08:59 谷', api.classify(at(2026, 11, 13, 8, 59)).phase, 'valley')

console.log('classify — 日类型')
check('2026-11-14 周六 10:00 → valley', api.classify(at(2026, 11, 14, 10, 0)).phase, 'valley')
check('2026-11-14 kind=weekend', api.classify(at(2026, 11, 14, 10, 0)).kind, 'weekend')
check('2026-10-01 国庆 周四 10:00 → valley', api.classify(at(2026, 10, 1, 10, 0)).phase, 'valley')
check('2026-10-01 kind=holiday', api.classify(at(2026, 10, 1, 10, 0)).kind, 'holiday')
check('2026-02-16 除夕 周一 10:00 → valley', api.classify(at(2026, 2, 16, 10, 0)).phase, 'valley')
check('2026-02-14 调休上班的周六 10:00 → valley', api.classify(at(2026, 2, 14, 10, 0)).phase, 'valley')
check('2026-02-14 kind=makeup', api.classify(at(2026, 2, 14, 10, 0)).kind, 'makeup')
check('2026-05-09 调休周六 → valley', api.classify(at(2026, 5, 9, 10, 0)).phase, 'valley')

console.log('classify — 没录到的年份退回周几规则')
check('2027-01-04 周一 10:00 → peak', api.classify(at(2027, 1, 4, 10, 0)).phase, 'peak')
check('2027-02-06 周六 → valley', api.classify(at(2027, 2, 6, 10, 0)).phase, 'valley')

console.log('normalizePayload / applyHolidayData')
const upstream2027 = {
  code: 0,
  holiday: {
    '01-01': { holiday: true, name: '元旦', wage: 3, date: '2027-01-01' },
    '01-31': { holiday: false, name: '春节前补班', wage: 1, date: '2027-01-31' },
    '02-06': { holiday: true, name: '初一', wage: 3, date: '2027-02-06' },
  },
}
const payload2027 = api.normalizePayload(2027, upstream2027)
check('timor 形状归一后条数', Object.keys(payload2027.days).length, 3)
check('补班 off=false', payload2027.days['2027-01-31'].off, false)
check('假日 name', payload2027.days['2027-02-06'].name, '初一')
check('normalizePayload 拒绝未知形状', (() => { try { api.normalizePayload(2026, {}) ; return 'no-throw' } catch { return 'throw' } })(), 'throw')

const passthrough = api.normalizePayload(2026, {
  year: 2026,
  days: { '2026-10-01': { name: '国庆', off: true } },
})
check('已归一形状直接通过', passthrough.days['2026-10-01'].off, true)

let notified = 0
const unsubscribe = api.subscribe(() => {
  notified += 1
})
api.applyHolidayData([payload2027], { at: at(2026, 11, 24, 1, 21), source: 'remote', years: [2027] })
check('applyHolidayData 广播', notified, 1)
check('2027-01-31 补班周六 → valley', api.classify(at(2027, 1, 31, 10, 0)).phase, 'valley')
check('2027-01-31 kind=makeup', api.classify(at(2027, 1, 31, 10, 0)).kind, 'makeup')
check('2027-02-06 春节 → valley', api.classify(at(2027, 2, 6, 10, 0)).phase, 'valley')
check('2027-02-06 kind=holiday', api.classify(at(2027, 2, 6, 10, 0)).kind, 'holiday')
check('2027-01-01 元旦 周五 → valley', api.classify(at(2027, 1, 1, 10, 0)).phase, 'valley')
check('内置 2026 端午在 2027 覆盖后仍在', api.classify(at(2026, 6, 19, 10, 0)).kind, 'holiday')

api.resetHolidayData()
check('resetHolidayData 广播', notified, 2)
check('reset 后 2027-02-06 回到 weekend', api.classify(at(2027, 2, 6, 10, 0)).kind, 'weekend')
unsubscribe()

console.log('nextSwitch')
const thursday = at(2026, 11, 12, 14, 50)
check('周四 14:50 → 18:00', api.nextSwitch(thursday, api.classify(thursday).phase), at(2026, 11, 12, 18, 0))
const lunch = at(2026, 11, 12, 12, 30)
check('午休 12:30 → 14:00', api.nextSwitch(lunch, api.classify(lunch).phase), at(2026, 11, 12, 14, 0))
const fridayNight = at(2026, 11, 13, 20, 0)
check('周五 20:00 → 周一 09:00', api.nextSwitch(fridayNight, api.classify(fridayNight).phase), at(2026, 11, 16, 9, 0))
const saturday = at(2026, 11, 14, 10, 0)
check('周六 10:00 → 周一 09:00', api.nextSwitch(saturday, api.classify(saturday).phase), at(2026, 11, 16, 9, 0))

console.log('humanSpan / dayLine / snapshot')
check('humanSpan 90 分钟', api.humanSpan(90 * 60 * 1000), '1 小时 30 分')
check('humanSpan 60 分钟', api.humanSpan(60 * 60 * 1000), '1 小时')
check('humanSpan 25 分钟', api.humanSpan(25 * 60 * 1000), '25 分钟')
check('humanSpan 30 秒抬到 1 分钟', api.humanSpan(30 * 1000), '1 分钟')

check('dayLine holiday', api.dayLine('holiday'), '法定节假日 · 全天空闲')
check('dayLine makeup', api.dayLine('makeup'), '调休上班日 · 仍按周末算，全天空闲')
check('dayLine weekend', api.dayLine('weekend'), '周末 · 全天空闲')
check('dayLine workday', api.dayLine('workday'), '周一至周五 · 9:00–12:00 / 14:00–18:00 为峰')

const snap = api.snapshot(thursday)
check('snapshot.name', snap.name, '梁文峰')
check('snapshot.price', snap.price, '高峰价')
check('snapshot.switchClock', snap.switchClock, '18:00')
check('snapshot.switchIn', snap.switchIn, '3 小时 10 分')
check('snapshot.targetName', snap.targetName, '梁文谷')
check('snapshot.data（reset 后为内置）', snap.data, '内置 2026 清单')
check('snapshot.aria（中文）', snap.aria.startsWith('当前高峰价：梁文峰。'), true)

console.log('locale — English')
api.setLocale('en')
const snapEn = api.snapshot(thursday)
check('en: 徽标名字保持梁文峰', snapEn.name, '梁文峰')
check('en: price', snapEn.price, 'Peak price')
check('en: priceNote', snapEn.priceNote, 'Peak is 2x the off-peak price')
check('en: targetName 保持梁文谷', snapEn.targetName, '梁文谷')
check('en: dayLine workday', api.dayLine('workday'), 'Mon–Fri · 9:00–12:00 / 14:00–18:00 are peak')
check('en: dayLine holiday', api.dayLine('holiday'), 'Public holiday · off-peak all day')
check('en: dayLine makeup', api.dayLine('makeup'), 'Make-up workday · still counts as weekend, off-peak all day')
check('en: dayLine weekend', api.dayLine('weekend'), 'Weekend · off-peak all day')
check('en: humanSpan 90min', api.humanSpan(90 * 60 * 1000), '1h 30m')
check('en: humanSpan 25min', api.humanSpan(25 * 60 * 1000), '25m')
check('en: switchIn', snapEn.switchIn, '3h 10m')
check('en: data builtin', snapEn.data, 'Built-in 2026 table')
check('en: aria', snapEn.aria.startsWith('Currently Peak price: 梁文峰.'), true)

console.log('locale — 切回中文 / 非法值兜底')
api.setLocale('zh')
check('setLocale 回到 zh', api.snapshot(thursday).price, '高峰价')
api.setLocale('fr')
check('未知语言回落 zh', api.snapshot(thursday).price, '高峰价')

console.log('')
if (failed > 0) {
  console.error(`${String(failed)} / ${String(ran)} 项检查失败`)
  process.exit(1)
}
console.log(`全部 ${String(ran)} 项检查通过`)
