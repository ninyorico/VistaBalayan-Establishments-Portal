const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_RETRIES = 2

const supabaseUrl = process.env.SUPABASE_URL || 'https://jopqjlvtaxgfxqbdbqqq.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_zs0OkMYBv5BmHUk92KNoPQ_FzCJKw27'
const portalUrl = process.env.PORTAL_APP_URL || 'https://vistabalayan-establishments-portal.vercel.app'

const targets = [
  {
    name: 'portal app shell',
    url: portalUrl,
    headers: { 'User-Agent': 'VistaBalayan-Warmup/1.0' },
  },
  {
    name: 'portal auth endpoint',
    url: `${supabaseUrl}/auth/v1/health`,
    headers: {
      apikey: supabaseKey,
      'User-Agent': 'VistaBalayan-Warmup/1.0',
    },
  },
  {
    name: 'portal profile access path',
    url: `${supabaseUrl}/rest/v1/profiles?select=id,role&limit=1`,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'User-Agent': 'VistaBalayan-Warmup/1.0',
    },
    allowStatuses: [200, 401],
  },
  {
    name: 'portal establishments access path',
    url: `${supabaseUrl}/rest/v1/establishments?select=id,name,status,type&limit=1`,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'User-Agent': 'VistaBalayan-Warmup/1.0',
    },
  },
]

async function pingTarget(target, attempt = 1) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const startedAt = Date.now()
    const response = await fetch(target.url, {
      method: 'GET',
      headers: target.headers,
      cache: 'no-store',
      signal: controller.signal,
    })
    const text = await response.text()
    const elapsedMs = Date.now() - startedAt
    const allowed = target.allowStatuses || [200]

    if (!allowed.includes(response.status)) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`)
    }

    console.log(`[warmup] ${target.name}: ok ${response.status} in ${elapsedMs}ms`)
    return
  } catch (error) {
    if (attempt <= DEFAULT_RETRIES) {
      console.warn(`[warmup] ${target.name}: retry ${attempt}/${DEFAULT_RETRIES} after ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      return pingTarget(target, attempt + 1)
    }
    throw new Error(`${target.name} failed after ${attempt} attempts: ${error.message}`)
  } finally {
    clearTimeout(timeout)
  }
}

const results = await Promise.allSettled(targets.map((target) => pingTarget(target)))
const failures = results.filter((result) => result.status === 'rejected')

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[warmup] ${failure.reason.message}`)
  }
  process.exit(1)
}

console.log(`[warmup] completed ${targets.length} checks`)
