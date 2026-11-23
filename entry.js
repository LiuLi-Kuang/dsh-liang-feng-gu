/**
 * Host half of the 峰谷 badge: one local route that proxies the Chinese
 * holiday calendar, so the browser half never crosses origins.
 *
 *   GET /plugins/liang-feng-gu/holidays?year=2026
 *     -> { year, days: { '2026-01-01': { name, off } }, upstream, fetchedAt }
 *
 * `days[date].off === true` 休（法定节假日）
 * `days[date].off === false` 补班（调休上班日，峰谷判定仍按周几算，见 client.js）
 *
 * Upstream default is timor.tech's holiday API (community-maintained, follows
 * the State Council notices; see README for the disclaimer). Override per
 * profile via the bundle row config, e.g. in cordis.patch.yml:
 *
 *   - insert:
 *       - id: liang-feng-gu
 *         name: '@local/dsh-liang-feng-gu'
 *         config:
 *           upstream: 'https://your-mirror.example/holiday/year/'  # {year} appended
 *           timeoutMs: 8000
 */

/** Package name the loader mounts this row as. */
export const name = 'liang-feng-gu'

/** Services this half consumes. */
export const inject = ['webServer']

/** Everything under this prefix belongs to this plugin. */
const ROUTE = '/plugins/liang-feng-gu/holidays'

const DEFAULT_UPSTREAM = 'https://timor.tech/api/holiday/year/'
const DEFAULT_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 6 * 3600 * 1000

/** year -> { at, data }：进程内存缓存，重启即清。 */
const cache = new Map()

/** 解析请求里的年份：?year=YYYY 或路径 /holidays/YYYY，缺省用北京时间当前年。 */
function requestedYear(url) {
  const raw = typeof url === 'string' ? url : ''
  let match = /[?&]year=(\d{4})/.exec(raw)
  if (match === null) match = /\/holidays\/(\d{4})/.exec(raw)
  if (match !== null) return Number(match[1])
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear()
}

/** 把 timor.tech 的 { code, holiday: { 'MM-DD': ... } } 拍平成 { year, days }。 */
function normalize(year, payload) {
  const raw = payload !== null && typeof payload === 'object' ? payload.holiday : null
  if (raw === null || typeof raw !== 'object') {
    throw new Error('unexpected upstream payload')
  }
  const days = {}
  for (const item of Object.values(raw)) {
    if (item === null || typeof item !== 'object' || typeof item.date !== 'string') continue
    days[item.date] = { name: String(item.name ?? ''), off: item.holiday === true }
  }
  return { year, days, upstream: 'timor.tech', fetchedAt: new Date().toISOString() }
}

/** 单年数据：命中且未过期直接回缓存，否则回源。 */
async function loadYear(year, upstream, timeoutMs) {
  const hit = cache.get(year)
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.data

  if (typeof fetch !== 'function') {
    throw new Error('global fetch unavailable on this host')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${upstream}${String(year)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (res.ok !== true) throw new Error(`upstream HTTP ${String(res.status)}`)
    const data = normalize(year, await res.json())
    cache.set(year, { at: Date.now(), data })
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** 序列化并回一条 JSON。 */
function sendJson(res, status, payload, headOnly) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(headOnly === true ? undefined : body)
}

/** Mount the route. */
export function apply(ctx, config) {
  const conf = config !== null && typeof config === 'object' ? config : {}
  const upstream =
    typeof conf.upstream === 'string' && conf.upstream.trim() !== ''
      ? conf.upstream.trim()
      : DEFAULT_UPSTREAM
  const timeoutMs = Number.isFinite(Number(conf.timeoutMs)) ? Number(conf.timeoutMs) : DEFAULT_TIMEOUT_MS

  const handler = (req, res) => {
    void (async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'method not allowed' }, req.method === 'HEAD')
        return
      }
      try {
        const year = requestedYear(req.url)
        const data = await loadYear(year, upstream, timeoutMs)
        sendJson(res, 200, data, req.method === 'HEAD')
      } catch (error) {
        const message = String(error?.message ?? error)
        ctx.logger?.warn?.(`liang-feng-gu: holidays route failed: ${message}`)
        sendJson(res, 502, { error: message }, req.method === 'HEAD')
      }
    })()
  }

  ctx.effect(
    () =>
      ctx.webServer.register(
        { kind: 'prefix', path: ROUTE, handler },
        'liang-feng-gu: holidays route',
      ),
    'liang-feng-gu: holidays route',
  )

  ctx.logger?.info?.(`liang-feng-gu: holiday calendar served at ${ROUTE} (upstream ${upstream})`)
}
