// REP ERP 云同步后端（零依赖 Node 服务）
// 实现前端 sync.ts 的 REST 协议：
//   GET  {host}/sync?key=APIKEY        -> 返回 { snapshot: <DbSnapshot> } 或 404
//   PUT  {host}/sync  body:{ key, snapshot } -> 覆盖写入，返回 { ok:true }
//
// 部署方式（任选其一，均免 ICP 备案）：
//   1) 内网穿透：本机 node sync-server.mjs，再用 cpolar/ngrok 暴露 https 地址填到系统「设置-云同步」。
//   2) 香港/境外云：上传到任意支持 Node 的免费平台（如 Render / Railway / Fly.io），填入分配的地址。
//
// 启动： node server/sync-server.mjs   （默认端口 8787，可用 PORT 环境变量覆盖）
// 安全提示：key 为简单校验，生产环境请改用强随机密钥 + HTTPS。

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '.sync-data')
const DATA_FILE = join(DATA_DIR, 'snapshot.json')
const PORT = process.env.PORT || 8787
const VALID_KEY = process.env.SYNC_KEY || 'rep-erp-default-key'

async function readSnapshot() {
  if (!existsSync(DATA_FILE)) return null
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  // CORS（前端跨域调用需要）
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  if (!url.pathname.startsWith('/sync')) {
    res.writeHead(404)
    return res.end('Not found')
  }

  const key = url.searchParams.get('key') || (req.method === 'PUT' ? '' : '')
  if (req.method === 'GET') {
    if (key !== VALID_KEY) {
      res.writeHead(403)
      return res.end(JSON.stringify({ error: 'invalid key' }))
    }
    const snap = await readSnapshot()
    if (!snap) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ snapshot: snap }))
  }

  if (req.method === 'PUT') {
    let body = ''
    for await (const chunk of req) body += chunk
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      res.writeHead(400)
      return res.end(JSON.stringify({ error: 'bad json' }))
    }
    if (parsed.key !== VALID_KEY) {
      res.writeHead(403)
      return res.end(JSON.stringify({ error: 'invalid key' }))
    }
    if (!parsed.snapshot) {
      res.writeHead(400)
      return res.end(JSON.stringify({ error: 'missing snapshot' }))
    }
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true })
    await writeFile(DATA_FILE, JSON.stringify(parsed.snapshot, null, 2))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, at: Date.now() }))
  }

  res.writeHead(405)
  res.end()
})

server.listen(PORT, () => {
  console.log(`REP 云同步服务已启动: http://localhost:${PORT}/sync`)
  console.log(`校验密钥: ${VALID_KEY}（可用环境变量 SYNC_KEY 修改）`)
})
