// 同步队列与运行时状态（被 db.ts 钩子与 sync.ts 网络层共用，本文件不依赖 db，避免循环引用）
import { loadSettings } from './db'

const PULL_KEY = 'rep-erp-lastpull'

let backendUrl = ''
let token = ''
let applyingRemote = false

export function setBackendUrl(u: string) {
  backendUrl = (u || '').trim().replace(/\/+$/, '')
}
export function getBackendUrl() {
  return backendUrl
}
export function loadBackendFromSettings() {
  const s = loadSettings()
  setBackendUrl((s as any).backendUrl || '')
}

export function setToken(t: string) {
  token = t || ''
}
export function getToken() {
  return token
}

export function setApplyingRemote(v: boolean) {
  applyingRemote = v
}
export function getApplyingRemote() {
  return applyingRemote
}

export function getLastPull(): number {
  try {
    return Number(localStorage.getItem(PULL_KEY) || 0)
  } catch {
    return 0
  }
}
export function setLastPull(t: number) {
  try {
    localStorage.setItem(PULL_KEY, String(t))
  } catch {}
}

// 脏数据队列：key = `${table}:${id}`
const dirty = new Map<string, { table: string; id: string; deleted: boolean }>()

export function markDirty(table: string, id: string, deleted = false) {
  if (getApplyingRemote()) return
  dirty.set(`${table}:${id}`, { table, id, deleted })
}

export function takeDirty(): { table: string; id: string; deleted: boolean }[] {
  const arr = Array.from(dirty.values())
  dirty.clear()
  return arr
}
