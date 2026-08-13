// REP ERP —— 多端共享后端（零依赖 Node 服务）
// 职责：
//   1) 中央数据库（JSON 文件存储，部署在同一服务上，所有用户共享同一份数据）
//   2) 服务端账号校验（/api/login），密码 SHA-256 哈希，不存明文
//   3) 按记录的增量同步（/api/sync）：pull 拉取他人改动，push 推本地改动
//   4) 同源静态托管前端 dist（一个服务、一个域名，免 CORS、免备案）
//
// 环境变量：
//   PORT            监听端口（Render 等平台自动注入，默认 8787）
//   DATA_DIR        数据存储目录（默认 ./data，随服务目录）
//   CORS_ORIGIN     允许的前端来源，逗号分隔；默认 "*"（同源部署可留空）

import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
const PORT = parseInt(process.env.PORT || '8787', 10)
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

const DB_FILE = path.join(DATA_DIR, 'db.json')
const ENTITIES = ['suppliers', 'buyers', 'products', 'parts', 'orders', 'logs']
const USER_ENTITY = 'users'

fs.mkdirSync(DATA_DIR, { recursive: true })

// ---------------- 存储层 ----------------
function sha256(s) {
  return 'sha256:' + createHash('sha256').update(s, 'utf8').digest('hex')
}

function defaultDB() {
  return {
    users: [],
    suppliers: [],
    buyers: [],
    products: [],
    parts: [],
    orders: [],
    logs: [],
  }
}

let dbCache = null
let writeChain = Promise.resolve()

function readDB() {
  if (dbCache) return dbCache
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    dbCache = { ...defaultDB(), ...parsed }
  } catch {
    dbCache = defaultDB()
    seedAdmins(dbCache)
    persistNow(dbCache)
  }
  if (!dbCache.users || dbCache.users.length === 0) {
    seedAdmins(dbCache)
    persistNow(dbCache)
  }
  return dbCache
}

// 序列化写入，避免并发损坏
function persist() {
  writeChain = writeChain.then(() => persistNow(readDB()))
  return writeChain
}
function persistNow(data) {
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, DB_FILE)
}

function seedAdmins(data) {
  const admins = [
    { username: 'wanghuizhen', name: '王慧珍', password: 'wanghuizhen123' },
    { username: 'jinhuaqiang', name: '金华强', password: 'jinhuaqiang123' },
  ]
  for (const a of admins) {
    if (!data.users.find((u) => u.username === a.username)) {
      data.users.push({
        id: randomUUID(),
        username: a.username,
        name: a.name,
        passwordHash: sha256(a.password),
        role: 'admin',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  }
}

// ---------------- 会话（登录态） ----------------
const sessions = new Map() // token -> { username, role, exp }

function createSession(username, role) {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  sessions.set(token, { username, role, exp: Date.now() + 7 * 86400000 })
  return token
}

function getSession(token) {
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  if (s.exp < Date.now()) {
    sessions.delete(token)
    return null
  }
  return s
}

// ---------------- 同步合并 ----------------
function applyChange(entity, record) {
  if (!ENTITIES.includes(entity)) return
  const arr = readDB()[entity]
  const idx = arr.findIndex((r) => r.id === record.id)
  if (idx === -1) {
    arr.push(record)
  } else {
    const cur = arr[idx]
    if ((record.updatedAt || 0) >= (cur.updatedAt || 0)) arr[idx] = record
  }
}

function collectChangesSince(since) {
  const data = readDB()
  const out = []
  for (const e of ENTITIES) {
    for (const r of data[e]) {
      if ((r.updatedAt || 0) > (since || 0)) out.push({ entity: e, record: r })
    }
  }
  return out
}

// ---------------- HTTP 工具 ----------------
function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    ...headers,
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = ''
    req.on('data', (c) => (buf += c))
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function extractToken(req, url) {
  const auth = req.headers['authorization']
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  return url.searchParams.get('token') || ''
}

function requireToken(req, url) {
  const s = getSession(extractToken(req, url))
  if (!s) return null
  return s
}

// ---------------- 路由 ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname

  // 预检
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }

  // 健康检查
  if (p === '/api/health') return send(res, 200, { ok: true, time: Date.now() })

  // -------- 认证 --------
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req)
    const data = readDB()
    const u = data.users.find((x) => x.username === (b.username || '').trim())
    if (!u || u.passwordHash !== sha256(b.password || '')) {
      return send(res, 401, { ok: false, reason: '账号或密码错误' })
    }
    const token = createSession(u.username, u.role)
    return send(res, 200, {
      ok: true,
      token,
      user: { id: u.id, username: u.username, name: u.name, role: u.role },
    })
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const s = requireToken(req, url)
    if (s) sessions.delete(extractToken(req, url))
    return send(res, 200, { ok: true })
  }

  // -------- 以下 /api/* 接口需登录（前端静态页本身公开可访问） --------
  if (p.startsWith('/api/')) {
    const session = requireToken(req, url)
    if (!session) return send(res, 401, { ok: false, reason: '未登录或登录已过期' })

    // -------- 账号管理（仅管理员） --------
    if (p === '/api/users' && req.method === 'GET') {
      if (session.role !== 'admin') return send(res, 403, { ok: false, reason: '需要管理员权限' })
      const list = readDB().users.map(({ passwordHash, ...rest }) => rest)
      return send(res, 200, { ok: true, users: list })
    }

    if (p === '/api/users' && req.method === 'POST') {
      if (session.role !== 'admin') return send(res, 403, { ok: false, reason: '需要管理员权限' })
      const b = await readBody(req)
      const username = (b.username || '').trim()
      if (!username || !b.password) return send(res, 400, { ok: false, reason: '用户名和密码必填' })
      const data = readDB()
      if (data.users.find((x) => x.username === username)) return send(res, 409, { ok: false, reason: '用户名已存在' })
      const u = {
        id: randomUUID(),
        username,
        name: (b.name || '').trim(),
        passwordHash: sha256(b.password),
        role: b.role === 'viewer' ? 'viewer' : 'admin',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      data.users.push(u)
      await persist()
      const { passwordHash, ...rest } = u
      return send(res, 200, { ok: true, user: rest })
    }

    const um = p.match(/^\/api\/users\/([^/]+)\/(password|role)$/)
    if (um && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (session.role !== 'admin') return send(res, 403, { ok: false, reason: '需要管理员权限' })
      const id = um[1]
      const field = um[2]
      const data = readDB()
      const u = data.users.find((x) => x.id === id)
      if (!u) return send(res, 404, { ok: false, reason: '账号不存在' })
      if (field === 'password') {
        const b = await readBody(req)
        if (!b.password) return send(res, 400, { ok: false, reason: '密码必填' })
        u.passwordHash = sha256(b.password)
      } else {
        const b = await readBody(req)
        u.role = b.role === 'viewer' ? 'viewer' : 'admin'
      }
      u.updatedAt = Date.now()
      await persist()
      return send(res, 200, { ok: true })
    }

    if (p.startsWith('/api/users/') && req.method === 'DELETE') {
      if (session.role !== 'admin') return send(res, 403, { ok: false, reason: '需要管理员权限' })
      const id = p.split('/').pop()
      const data = readDB()
      const idx = data.users.findIndex((x) => x.id === id)
      if (idx === -1) return send(res, 404, { ok: false, reason: '账号不存在' })
      if (data.users[idx].username === session.username) return send(res, 400, { ok: false, reason: '不能删除自己' })
      data.users.splice(idx, 1)
      await persist()
      return send(res, 200, { ok: true })
    }

    // -------- 增量同步 --------
    if (p === '/api/sync' && req.method === 'GET') {
      const since = parseInt(url.searchParams.get('since') || '0', 10) || 0
      const changes = collectChangesSince(since)
      return send(res, 200, { ok: true, serverTime: Date.now(), changes })
    }

    if (p === '/api/sync' && req.method === 'POST') {
      const b = await readBody(req)
      const changes = Array.isArray(b.changes) ? b.changes : []
      for (const c of changes) {
        if (c && c.entity && c.record && c.record.id) applyChange(c.entity, c.record)
      }
      await persist()
      return send(res, 200, { ok: true, serverTime: Date.now(), applied: changes.length })
    }

    return send(res, 404, { ok: false, reason: 'Not Found' })
  }

  // -------- 静态前端（同源托管，公开） --------
  if (req.method === 'GET') {
    return serveStatic(p, res)
  }

  send(res, 404, { ok: false, reason: 'Not Found' })
})

// ---------------- 静态文件服务 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function serveStatic(p, res) {
  let rel = decodeURIComponent(p)
  if (rel === '/') rel = '/index.html'
  // 防目录穿越
  const filePath = path.normalize(path.join(DIST, rel))
  if (!filePath.startsWith(DIST)) return send(res, 403, { ok: false, reason: 'Forbidden' })

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
      })
      fs.createReadStream(filePath).pipe(res)
      return
    }
    // SPA 回退：未知路径返回 index.html
    const idx = path.join(DIST, 'index.html')
    fs.readFile(idx, (e2, buf) => {
      if (e2) return send(res, 404, { ok: false, reason: '前端未构建，请先 npm run build' })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buf)
    })
  })
}

server.listen(PORT, () => {
  console.log(`[REP] 服务已启动: http://localhost:${PORT}`)
  console.log(`[REP] 数据存储: ${DATA_DIR}`)
  console.log(`[REP] 默认管理员: wanghuizhen / wanghuizhen123 ， jinhuaqiang / jinhuaqiang123`)
})
