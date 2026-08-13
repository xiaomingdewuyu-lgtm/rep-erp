// 同步引擎：前端与中央后端之间的增量同步
//  - 业务数据（供应商/购买方/产品/零部件/订单/日志）走 /api/sync 增量拉取+推送
//  - 账号管理走专用 /api/users 接口（密码在服务端哈希）
//  - 本地 IndexedDB 作为缓存/离线层；后端是系统唯一真实数据源
import { db } from './db'
import {
  getBackendUrl,
  getToken,
  markDirty,
  setApplyingRemote,
  getApplyingRemote,
  getLastPull,
  setLastPull,
  takeDirty,
} from './syncQueue'

const TABLES = ['suppliers', 'buyers', 'products', 'parts', 'orders', 'logs'] as const

function apiURL(p: string): string {
  const base = getBackendUrl()
  if (!base) return p // 同源部署（后端同时托管前端）
  return base.replace(/\/+$/, '') + (p.startsWith('/') ? p : '/' + p)
}

async function apiFetch(p: string, opts: RequestInit = {}) {
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const t = getToken()
  if (t) headers['Authorization'] = 'Bearer ' + t
  const res = await fetch(apiURL(p), { ...opts, headers })
  let data: any = {}
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.reason || `HTTP ${res.status}`)
  return data
}

// ---------------- 登录 / 会话 ----------------
export async function serverLogin(username: string, password: string) {
  const data = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!data.ok) throw new Error(data.reason || '登录失败')
  return { token: data.token, user: data.user }
}

export async function serverLogout() {
  try {
    await apiFetch('/api/logout', { method: 'POST' })
  } catch {}
}

// ---------------- 账号管理（仅后端模式） ----------------
export async function serverListUsers() {
  const d = await apiFetch('/api/users')
  return d.users || []
}
export async function serverAddUser(v: { username: string; name?: string; password: string; role: 'admin' | 'viewer' }) {
  return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(v) })
}
export async function serverSetPassword(id: string, password: string) {
  return apiFetch(`/api/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) })
}
export async function serverSetRole(id: string, role: 'admin' | 'viewer') {
  return apiFetch(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
}
export async function serverDeleteUser(id: string) {
  return apiFetch(`/api/users/${id}`, { method: 'DELETE' })
}

// ---------------- 增量同步 ----------------
async function pushChanges(changes: any[]) {
  return apiFetch('/api/sync', { method: 'POST', body: JSON.stringify({ changes }) })
}

async function pullChanges(since: number) {
  const d = await apiFetch(`/api/sync?since=${since}`)
  return d
}

// 把本地脏数据推送到后端
export async function flush(): Promise<{ pushed: number }> {
  if (!getBackendUrl() || !getToken()) return { pushed: 0 }
  const items = takeDirty()
  if (!items.length) return { pushed: 0 }
  const changes: any[] = []
  for (const it of items) {
    if (it.deleted) {
      changes.push({ entity: it.table, record: { id: it.id, deleted: true, updatedAt: Date.now() } })
    } else {
      const rec = await db[it.table as any].get(it.id)
      if (rec) changes.push({ entity: it.table, record: rec })
    }
  }
  if (!changes.length) return { pushed: 0 }
  await pushChanges(changes)
  return { pushed: changes.length }
}

// 从后端拉取他人改动并写入本地
export async function pull(): Promise<{ pulled: number }> {
  if (!getBackendUrl() || !getToken()) return { pulled: 0 }
  const since = getLastPull()
  const r = await pullChanges(since)
  if (!r.ok) return { pulled: 0 }
  setApplyingRemote(true)
  try {
    for (const c of r.changes || []) {
      if ((TABLES as readonly string[]).includes(c.entity)) {
        await db[c.entity as any].put(c.record)
      }
    }
  } finally {
    setApplyingRemote(false)
  }
  setLastPull(r.serverTime || Date.now())
  return { pulled: (r.changes || []).length }
}

// 登录后一次性同步（先拉后推，确保两端一致）
export async function initialSync() {
  await pull()
  await flush()
}

// 手动"立即同步"
export async function manualSync(): Promise<{ pushed: number; pulled: number }> {
  const a = await flush()
  const b = await pull()
  return { pushed: a.pushed, pulled: b.pulled }
}

// ---------------- 自动同步引擎 ----------------
let started = false
export function startSyncEngine() {
  if (started) return
  started = true

  const tick = async () => {
    if (!getBackendUrl() || !getToken()) return
    try {
      await flush()
      await pull()
    } catch {
      // 网络异常忽略，下次再试
    }
  }

  if (typeof window !== 'undefined') {
    window.setInterval(tick, 15000)
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick()
    })
  }
}

export { markDirty, getApplyingRemote }
