window.__ModuleLoader__.load({
  id: '@local/dsh-liang-feng-gu',
  factory(require) {
    const React = require('react')
    const { useState, useEffect } = React
    const h = React.createElement

    /* 悬浮卡挂到 body 去渲染：徽标自身带着 white-space: nowrap、600 字重和紧凑行高，
     * 做它的子节点会被整段继承，卡片就既不换行也溢出边框。react-dom 拿不到时退回内联。 */
    const portal = (() => {
      try {
        const mod = require('react-dom')
        const api = mod?.createPortal !== undefined ? mod : mod?.default
        return typeof api?.createPortal === 'function' ? api.createPortal : null
      } catch (error) {
        console.warn('[liang-feng-gu] react-dom unavailable — tooltip stays inline', error)
        return null
      }
    })()

    /* ================================================================== *
     * core：峰谷判定 + 节假日表。
     * 这一段不碰 DOM、不碰 React —— scripts/verify.mjs 把两个 region
     * 标记之间的代码抠出来直接跑断言（npm test）。
     * ================================================================== */
    /* #region core */

    /* 峰谷规则（DeepSeek API 价格页脚注 2，原文）：
     *   「北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00
     *     为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。」
     *   空闲价 = 高峰价的一半（同档模型）。
     * 口径是「周几」而不是「上不上班」：调休上班的周六周日仍按周末算，全天谷价。 */

    /* 北京时间：Asia/Shanghai 固定 UTC+8、无夏令时，直接算术即可，不走 Intl。 */
    const BJ = 8 * 3600 * 1000
    const DAY = 24 * 3600 * 1000
    const MIN = 60 * 1000

    /** 状态只可能在这些整点翻转，找下次切换时只扫这些候选，不逐分钟遍历。 */
    const BOUNDARIES = [0, 9, 12, 14, 18]

    /** 内置兜底：2026 年法定节假日（国办发明电〔2025〕7 号）。远端同步失败时靠它。 */
    const HOLIDAYS_2026 = {
      '2026-01-01': '元旦',
      '2026-01-02': '元旦',
      '2026-01-03': '元旦',
      '2026-02-15': '春节',
      '2026-02-16': '春节',
      '2026-02-17': '春节',
      '2026-02-18': '春节',
      '2026-02-19': '春节',
      '2026-02-20': '春节',
      '2026-02-21': '春节',
      '2026-02-22': '春节',
      '2026-02-23': '春节',
      '2026-04-04': '清明',
      '2026-04-05': '清明',
      '2026-04-06': '清明',
      '2026-05-01': '劳动节',
      '2026-05-02': '劳动节',
      '2026-05-03': '劳动节',
      '2026-05-04': '劳动节',
      '2026-05-05': '劳动节',
      '2026-06-19': '端午',
      '2026-06-20': '端午',
      '2026-06-21': '端午',
      '2026-09-25': '中秋',
      '2026-09-26': '中秋',
      '2026-09-27': '中秋',
      '2026-10-01': '国庆',
      '2026-10-02': '国庆',
      '2026-10-03': '国庆',
      '2026-10-04': '国庆',
      '2026-10-05': '国庆',
      '2026-10-06': '国庆',
      '2026-10-07': '国庆',
    }

    /** 内置兜底：2026 年调休上班日。官方口径按周几判峰，这些日子仍算谷，只用于文案。 */
    const MAKEUP_2026 = {
      '2026-01-04': '元旦调休',
      '2026-02-14': '春节调休',
      '2026-02-28': '春节调休',
      '2026-05-09': '劳动节调休',
      '2026-09-20': '国庆调休',
      '2026-10-10': '国庆调休',
    }

    /** 统一成一张表：date -> { name, off }。off=true 休假，off=false 补班。 */
    const BUILTIN_DAYS = (() => {
      const map = {}
      for (const [date, name] of Object.entries(HOLIDAYS_2026)) map[date] = { name, off: true }
      for (const [date, name] of Object.entries(MAKEUP_2026)) map[date] = { name, off: false }
      return map
    })()

    /** 运行时表：启动时等于内置，同步成功后整体重建（内置作为缺失年份的兜底）。 */
    let dayMap = { ...BUILTIN_DAYS }

    /** 数据来源说明，显示在悬浮卡「数据」行。 */
    const dataMeta = { at: 0, source: 'builtin', years: [] }

    /* 表更新后通知所有挂着的徽标立即重算，不等下一个 15 秒 tick。 */
    const listeners = new Set()
    const subscribe = (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
    const notify = () => {
      for (const fn of [...listeners]) {
        try {
          fn()
        } catch (error) {
          console.warn('[liang-feng-gu] listener failed', error)
        }
      }
    }

    const pad2 = (n) => String(n).padStart(2, '0')

    const bjParts = (ms) => {
      const d = new Date(ms + BJ)
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        weekday: d.getUTCDay(),
      }
    }

    const dayKey = (p) => `${p.year}-${pad2(p.month)}-${pad2(p.day)}`

    const dayStart = (ms) => Math.floor((ms + BJ) / DAY) * DAY - BJ

    /** 09:00–12:00 与 14:00–18:00，左闭右开。 */
    const inPeakWindow = (hour, minute) => {
      const t = hour * 60 + minute
      return (t >= 9 * 60 && t < 12 * 60) || (t >= 14 * 60 && t < 18 * 60)
    }

    /** workday | weekend | holiday | makeup */
    const dayKindOf = (p) => {
      const entry = dayMap[dayKey(p)]
      if (entry !== undefined && entry.off === true) return 'holiday'
      if (entry !== undefined && entry.off === false) return 'makeup'
      return p.weekday === 0 || p.weekday === 6 ? 'weekend' : 'workday'
    }

    const isWorkday = (kind) => kind === 'workday'

    const classify = (ms) => {
      const p = bjParts(ms)
      const kind = dayKindOf(p)
      const peak = isWorkday(kind) && inPeakWindow(p.hour, p.minute)
      return { phase: peak ? 'peak' : 'valley', kind, parts: p }
    }

    /** 下一个峰谷切换时刻（epoch ms）；扫不到就返回 null。 */
    const nextSwitch = (now, currentPhase) => {
      const start = dayStart(now)
      for (let i = 0; i <= 9; i += 1) {
        for (const hour of BOUNDARIES) {
          const t = start + i * DAY + hour * 3600 * 1000
          if (t <= now) continue
          if (classify(t).phase !== currentPhase) return t
        }
      }
      return null
    }

    /** 「2 小时 15 分」；不足一分钟算 1 分钟，避免停在 0 分钟。 */
    const humanSpan = (ms) => {
      const total = Math.max(1, Math.round(ms / MIN))
      const hours = Math.floor(total / 60)
      const minutes = total % 60
      if (hours === 0) return `${minutes} 分钟`
      if (minutes === 0) return `${hours} 小时`
      return `${hours} 小时 ${minutes} 分`
    }

    const hhmm = (ms) => {
      const p = bjParts(ms)
      return `${pad2(p.hour)}:${pad2(p.minute)}`
    }

    const mmdd = (ms) => {
      const p = bjParts(ms)
      return `${pad2(p.month)}-${pad2(p.day)}`
    }

    /** 悬浮卡里的「谁在生效」一行。 */
    const dayLine = (kind) => {
      if (kind === 'holiday') return '法定节假日 · 全天空闲'
      if (kind === 'makeup') return '调休上班日 · 仍按周末算，全天空闲'
      if (kind === 'weekend') return '周末 · 全天空闲'
      return '周一至周五 · 9:00–12:00 / 14:00–18:00 为峰'
    }

    /** 悬浮卡「数据」行：当前用的是哪份节假日表。 */
    const dataLine = () => {
      if (dataMeta.at === 0) return '内置 2026 清单'
      const years = dataMeta.years.length > 0 ? dataMeta.years.join(' / ') : '—'
      const via = dataMeta.source === 'cache' ? '缓存' : '已同步'
      return `${years} · ${mmdd(dataMeta.at)} ${via}`
    }

    /**
     * 兼容两种上游格式：
     *  - timor.tech 原始格式 { code, holiday: { 'MM-DD': { holiday, name, date } } }
     *  - Host 路由回的已归一格式 { year, days: { 'YYYY-MM-DD': { name, off } } }
     * 统一输出 { year, days }。
     */
    const normalizePayload = (year, payload) => {
      if (
        payload !== null &&
        typeof payload === 'object' &&
        payload.days !== undefined &&
        typeof payload.days === 'object'
      ) {
        const days = {}
        for (const [date, item] of Object.entries(payload.days)) {
          if (item === null || typeof item !== 'object' || typeof item.off !== 'boolean') continue
          days[date] = { name: String(item.name ?? ''), off: item.off === true }
        }
        return { year, days }
      }
      const raw = payload !== null && typeof payload === 'object' ? payload.holiday : null
      if (raw === null || typeof raw !== 'object') {
        throw new Error('unexpected holiday payload')
      }
      const days = {}
      for (const item of Object.values(raw)) {
        if (item === null || typeof item !== 'object' || typeof item.date !== 'string') continue
        days[item.date] = { name: String(item.name ?? ''), off: item.holiday === true }
      }
      return { year, days }
    }

    /** 用远端数据重建运行时表（内置表垫底再覆盖），并广播。 */
    const applyHolidayData = (payloads, meta) => {
      const next = { ...BUILTIN_DAYS }
      for (const payload of payloads) {
        if (payload === null || typeof payload !== 'object' || payload.days === undefined) continue
        for (const [date, item] of Object.entries(payload.days)) {
          if (item === null || typeof item !== 'object' || typeof item.off !== 'boolean') continue
          next[date] = { name: String(item.name ?? ''), off: item.off === true }
        }
      }
      dayMap = next
      dataMeta.at =
        meta !== null && typeof meta === 'object' && typeof meta.at === 'number' ? meta.at : Date.now()
      dataMeta.source =
        meta !== null && typeof meta === 'object' && typeof meta.source === 'string' && meta.source !== ''
          ? meta.source
          : 'remote'
      dataMeta.years =
        meta !== null && typeof meta === 'object' && Array.isArray(meta.years) ? meta.years : []
      notify()
    }

    /** 回到内置表（测试用）。 */
    const resetHolidayData = () => {
      dayMap = { ...BUILTIN_DAYS }
      dataMeta.at = 0
      dataMeta.source = 'builtin'
      dataMeta.years = []
      notify()
    }

    const snapshot = (now = Date.now()) => {
      const state = classify(now)
      const peak = state.phase === 'peak'
      const at = nextSwitch(now, state.phase)
      return {
        phase: state.phase,
        name: peak ? '梁文峰' : '梁文谷',
        price: peak ? '高峰价' : '空闲价',
        day: dayLine(state.kind),
        priceNote: peak ? '高峰价为空闲价的 2 倍' : '空闲价为高峰价的一半',
        switchAt: at,
        switchIn: at === null ? '' : humanSpan(at - now),
        switchClock: at === null ? '' : hhmm(at),
        targetName: peak ? '梁文谷' : '梁文峰',
        clock: hhmm(now),
        data: dataLine(),
      }
    }

    /* #endregion core */

    /* ---------------------------------------------------------------- *
     * 节假日同步：每次打开页面取一次（当年 + 次年），之后每 6 小时再取。
     * 优先走 Host 半侧的本地路由（同源、无 CORS、Host 有内存缓存）；
     * 路由不可用 → localStorage 上次结果 → 内置 2026 表。
     * ---------------------------------------------------------------- */
    const SYNC_ROUTE = '/plugins/liang-feng-gu/holidays'
    const CACHE_KEY = 'dsh-liang-feng-gu:holidays:v1'
    const SYNC_INTERVAL_MS = 6 * 3600 * 1000
    const FETCH_TIMEOUT_MS = 8000

    const readCache = () => {
      try {
        const raw = window.localStorage.getItem(CACHE_KEY)
        if (typeof raw !== 'string' || raw === '') return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (!Array.isArray(parsed.payloads) || typeof parsed.at !== 'number') return null
        if (!Array.isArray(parsed.years)) return null
        return parsed
      } catch {
        return null
      }
    }

    const writeCache = (record) => {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(record))
      } catch {
        /* 隐私模式写不进去就算了，下次再同步 */
      }
    }

    const fetchYear = async (year) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const res = await fetch(`${SYNC_ROUTE}?year=${String(year)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
          cache: 'no-store',
        })
        if (res.ok !== true) throw new Error(`route HTTP ${String(res.status)}`)
        return normalizePayload(year, await res.json())
      } finally {
        clearTimeout(timer)
      }
    }

    const syncHolidays = async () => {
      // 先把上次的结果垫上：本次同步失败也至少用最近的表
      const cached = readCache()
      if (cached !== null) {
        applyHolidayData(cached.payloads, { at: cached.at, source: 'cache', years: cached.years })
      }

      const currentYear = bjParts(Date.now()).year
      const years = [currentYear, currentYear + 1]
      try {
        const settled = await Promise.allSettled(years.map((y) => fetchYear(y)))
        const payloads = []
        for (const result of settled) {
          if (result.status !== 'fulfilled') continue
          if (result.value === null || result.value === undefined) continue
          if (Object.keys(result.value.days).length === 0) continue
          payloads.push(result.value)
        }
        if (payloads.length === 0) throw new Error('no usable payload')
        const at = Date.now()
        const got = payloads.map((p) => p.year)
        applyHolidayData(payloads, { at, source: 'remote', years: got })
        writeCache({ at, years: got, payloads })
      } catch (error) {
        console.warn('[liang-feng-gu] holiday sync failed — using cache/builtin', error)
      }
    }

    const STYLE = `
/* ---- 峰谷徽标：会话 header 右侧席位 -------------------------------- */
.lfg-badge {
  --lfg-fg: #0F766E;
  --lfg-bg: rgba(13, 148, 136, 0.10);
  --lfg-line: rgba(13, 148, 136, 0.34);
  --lfg-halo: rgba(13, 148, 136, 0.18);

  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 22px;
  padding: 0 9px 0 8px;
  margin: 0 2px;
  border: 1px solid var(--lfg-line);
  border-radius: 999px;
  background: var(--lfg-bg);
  color: var(--lfg-fg);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  outline: none;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease;
}

.lfg-badge[data-phase='peak'] {
  --lfg-fg: #B45309;
  --lfg-bg: rgba(245, 158, 11, 0.12);
  --lfg-line: rgba(217, 119, 6, 0.36);
  --lfg-halo: rgba(245, 158, 11, 0.20);
}

.lfg-badge:hover,
.lfg-badge:focus-visible {
  background: var(--lfg-bg);
  border-color: var(--lfg-fg);
}

.lfg-badge__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px var(--lfg-halo);
  animation: lfg-breath 2.6s ease-in-out infinite;
}

.lfg-badge__name {
  font-variant-numeric: tabular-nums;
}

@keyframes lfg-breath {
  0%, 100% { opacity: .55; transform: scale(.9); }
  50%      { opacity: 1;   transform: scale(1.1); }
}

@media (prefers-reduced-motion: reduce) {
  .lfg-badge__dot { animation: none; opacity: 1; }
}

/* 悬浮卡：固定定位 + 实色底。主题的 --dsw-specific-menu 是半透明的，正文会透上来。
 * 正常走 portal 挂到 body；万一退回内联（没有 react-dom），下面这组复位也兜得住。 */
.lfg-tip {
  position: fixed;
  z-index: 2147483100;
  width: 262px;
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  padding: 11px 13px 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  background: #FFFFFF;
  color: #0F172A;
  box-shadow:
    0 12px 30px rgba(15, 23, 42, 0.16),
    0 1px 3px rgba(15, 23, 42, 0.10);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: normal;
  white-space: normal;
  overflow-wrap: break-word;
  pointer-events: none;
}

.lfg-tip__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}

.lfg-tip__head small {
  font-weight: 500;
  opacity: .62;
}

.lfg-tip__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  opacity: .86;
}

.lfg-tip__row > span:first-child {
  flex: none;
  width: 34px;
  opacity: .6;
}

.lfg-tip__row > span:last-child {
  flex: 1 1 auto;
  min-width: 0;
}

.lfg-tip__hint {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px dashed rgba(15, 23, 42, 0.14);
  opacity: .72;
}

body[data-ds-dark-theme] .lfg-badge {
  --lfg-fg: #5EEAD4;
  --lfg-bg: rgba(45, 212, 191, 0.14);
  --lfg-line: rgba(45, 212, 191, 0.36);
  --lfg-halo: rgba(45, 212, 191, 0.22);
}

body[data-ds-dark-theme] .lfg-badge[data-phase='peak'] {
  --lfg-fg: #FBBF24;
  --lfg-bg: rgba(251, 191, 36, 0.14);
  --lfg-line: rgba(251, 191, 36, 0.38);
  --lfg-halo: rgba(251, 191, 36, 0.22);
}

body[data-ds-dark-theme] .lfg-tip {
  border-color: rgba(255, 255, 255, 0.14);
  background: #171D26;
  color: #E6EAF0;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.62);
}

body[data-ds-dark-theme] .lfg-tip__hint {
  border-top-color: rgba(255, 255, 255, 0.18);
}
`

    /**
     * 席位里的一枚小徽标：谷价显示「梁文谷」，峰价显示「梁文峰」。
     * 每 15 秒刷一次；节假日表同步完成时经 subscribe 立即刷。
     */
    function PriceBadge() {
      const [snap, setSnap] = useState(() => snapshot())
      const [tip, setTip] = useState(null)

      useEffect(() => {
        const timer = setInterval(() => setSnap(snapshot()), 15000)
        const unsubscribe = subscribe(() => setSnap(snapshot()))
        return () => {
          clearInterval(timer)
          unsubscribe()
        }
      }, [])

      const showTip = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setTip({
          top: Math.round(rect.bottom + 8),
          right: Math.max(8, Math.round(window.innerWidth - rect.right)),
        })
      }

      const hideTip = () => setTip(null)

      const label = `当前${snap.price}：${snap.name}。${snap.day}。${
        snap.switchIn === '' ? '' : `距转${snap.targetName}还有${snap.switchIn}。`
      }`

      const tipNode =
        tip === null
          ? null
          : h(
              'div',
              {
                className: 'lfg-tip',
                role: 'tooltip',
                style: { top: `${String(tip.top)}px`, right: `${String(tip.right)}px` },
              },
              h(
                'div',
                { className: 'lfg-tip__head' },
                snap.name,
                h('small', null, `${snap.price} · 北京时间 ${snap.clock}`),
              ),
              h('div', { className: 'lfg-tip__row' }, h('span', null, '时段'), h('span', null, snap.day)),
              h('div', { className: 'lfg-tip__row' }, h('span', null, '价格'), h('span', null, snap.priceNote)),
              snap.switchIn === ''
                ? null
                : h(
                    'div',
                    { className: 'lfg-tip__row' },
                    h('span', null, '切换'),
                    h('span', null, `${snap.switchClock} 转${snap.targetName} · ${snap.switchIn}后`),
                  ),
              h('div', { className: 'lfg-tip__row' }, h('span', null, '数据'), h('span', null, snap.data)),
              h(
                'div',
                { className: 'lfg-tip__hint' },
                '省 token：长任务留到谷时再跑，同样的活少花一半。',
              ),
            )

      return h(
        React.Fragment,
        null,
        h(
          'div',
          {
            className: 'lfg-badge',
            'data-phase': snap.phase,
            role: 'status',
            tabIndex: 0,
            'aria-label': label,
            onMouseEnter: showTip,
            onMouseLeave: hideTip,
            onFocus: showTip,
            onBlur: hideTip,
          },
          h('span', { className: 'lfg-badge__dot', 'aria-hidden': true }),
          h('span', { className: 'lfg-badge__name' }, snap.name),
        ),
        // 挂到 body 上：徽标带着 nowrap / 600 字重 / 行高，做子节点会被整段继承。
        tipNode === null ? null : portal === null ? tipNode : portal(tipNode, document.body),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'liang-feng-gu/style'
          tag.textContent = STYLE
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'liang-feng-gu: style')

        // 每次打开页面同步一次节假日表；之后每 6 小时再拉一次。
        // 注意这是浏览器半侧的「每次开启」；Host 半侧的路由随 DSH 启动常驻。
        void syncHolidays()
        ctx.effect(() => {
          const timer = setInterval(() => {
            void syncHolidays()
          }, SYNC_INTERVAL_MS)
          return () => {
            clearInterval(timer)
          }
        }, 'liang-feng-gu: holiday sync timer')

        // 会话 header 右侧工具席位：紧挨着「面板展开」按钮。
        // 换到 actions 席位是旧版客户端没有 utilities 时的退路。
        const trySeat = (name) => {
          try {
            ctx.slots.inject(name, () =>
              ctx.slots.register(
                { name, id: 'liang-feng-gu-badge', order: 100, label: '峰谷提醒' },
                PriceBadge,
              ),
            )
            return true
          } catch (error) {
            console.warn(`[liang-feng-gu] slot ${name} unavailable`, error)
            return false
          }
        }

        if (!trySeat('conversation.session.header.utilities')) {
          trySeat('conversation.session.header.actions')
        }
      },
    }
  },
})
