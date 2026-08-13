import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { seedUsers, verifyLogin, loadSettings } from './db'
import { serverLogin, serverLogout, initialSync, startSyncEngine } from './sync'
import { loadBackendFromSettings, getBackendUrl, setBackendUrl, setToken } from './syncQueue'
import { User } from './types'

const AUTH_KEY = 'rep-erp-auth'

function readStored(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

interface AuthCtx {
  user: User | null
  login: (username: string, password: string) => Promise<{ ok: boolean; reason?: string }>
  logout: () => void
  usingServer: boolean
}

const Ctx = createContext<AuthCtx>({
  user: null,
  login: async () => ({ ok: false }),
  logout: () => {},
  usingServer: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStored())

  useEffect(() => {
    // 读取后端地址配置并启动自动同步引擎
    loadBackendFromSettings()
    startSyncEngine()
    seedUsers() // 本地兜底：无后端时也能登录
  }, [])

  const login = async (username: string, password: string) => {
    loadBackendFromSettings() // 重新计算：同源线上环境会自动设为本 origin
    const backendUrl = getBackendUrl()
    if (backendUrl) {
      try {
        setBackendUrl(backendUrl)
        const r = await serverLogin(username.trim(), password)
        setToken(r.token)
        const safe: User = r.user
        setUser(safe)
        localStorage.setItem(AUTH_KEY, JSON.stringify(safe))
        await initialSync().catch(() => {})
        return { ok: true }
      } catch (e: any) {
        return { ok: false, reason: e?.message || '登录失败' }
      }
    }
    // 无后端：本地登录
    const u = await verifyLogin(username.trim(), password)
    if (!u) return { ok: false, reason: '账号或密码错误' }
    const safe: User = { ...u }
    delete (safe as any).passwordHash
    setUser(safe)
    localStorage.setItem(AUTH_KEY, JSON.stringify(safe))
    return { ok: true }
  }

  const logout = () => {
    if (getBackendUrlSafe()) serverLogout()
    setToken('')
    setUser(null)
    localStorage.removeItem(AUTH_KEY)
  }

  function getBackendUrlSafe() {
    return !!(loadSettings().sync as any).backendUrl
  }

  return (
    <Ctx.Provider value={{ user, login, logout, usingServer: !!getBackendUrl() }}>
      {children}
    </Ctx.Provider>
  )
}


export function useAuth() {
  return useContext(Ctx)
}
