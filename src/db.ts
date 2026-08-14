import Dexie, { Table } from 'dexie'
import {
  Supplier,
  Buyer,
  Product,
  Part,
  Order,
  OperationLog,
  Status,
  StatusLogEntry,
  DbSnapshot,
  BomItem,
  User,
} from './types'
import { markDirty, getApplyingRemote } from './syncQueue'

class RepDB extends Dexie {
  suppliers!: Table<Supplier, string>
  buyers!: Table<Buyer, string>
  products!: Table<Product, string>
  parts!: Table<Part, string>
  orders!: Table<Order, string>
  logs!: Table<OperationLog, string>
  users!: Table<User, string>

  constructor() {
    super('rep-erp')
    this.version(1).stores({
      suppliers: 'id, code, name, deleted',
      buyers: 'id, code, name, deleted',
      products: 'id, code, name, deleted',
      parts: 'id, code, name, deleted',
      orders: 'id, code, status, buyerId, supplierId, productId, partId, orderDate, deleted',
      logs: 'id, entityType, entityId, time',
    })
    this.version(2).stores({
      users: 'id, username',
    })
  }
}

export const db = new RepDB()

// 注册同步钩子：任何本地写入（新增/修改/删除）都会标记脏数据并补 updatedAt，
// 由同步引擎推送到中央后端；从后端拉取写入时（applyingRemote）自动跳过，避免回环。
const SYNC_TABLES: [keyof typeof db, string][] = [
  ['suppliers', 'suppliers'],
  ['buyers', 'buyers'],
  ['products', 'products'],
  ['parts', 'parts'],
  ['orders', 'orders'],
  ['logs', 'logs'],
]
for (const [tbl, name] of SYNC_TABLES) {
  const t: any = db[tbl]
  t.hook('creating', (_pk: any, obj: any) => {
    if (!obj.updatedAt) obj.updatedAt = Date.now()
    if (!getApplyingRemote() && obj.id) markDirty(name, obj.id)
  })
  t.hook('updating', (pk: any, mods: any) => {
    mods.updatedAt = Date.now()
    if (!getApplyingRemote()) markDirty(name, pk)
  })
  t.hook('deleting', (pk: any) => {
    if (!getApplyingRemote()) markDirty(name, pk, true)
  })
}

const PREFIX: Record<string, string> = {
  supplier: 'SUP',
  buyer: 'BUY',
  product: 'PRO',
  part: 'PAR',
  order: 'ORD',
}

function pad(n: number, len = 3) {
  return String(n).padStart(len, '0')
}

function ym(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}`
}

// 生成唯一编号：前缀 + 年月 + 当月序号
export async function genCode(kind: keyof typeof PREFIX): Promise<string> {
  const prefix = PREFIX[kind]
  const now = Date.now()
  const month = ym(now)
  const tableMap: any = {
    supplier: db.suppliers,
    buyer: db.buyers,
    product: db.products,
    part: db.parts,
    order: db.orders,
  }
  const table = tableMap[kind]
  const existing = await table
    .where('code')
    .startsWith(`${prefix}-${month}`)
    .count()
  return `${prefix}-${month}${pad(existing + 1)}`
}

export function availableOf(row: { stock: number; lockedStock: number }) {
  return Math.max(0, row.stock - row.lockedStock)
}

// 当前操作员取自已登录用户
export async function getOperator(): Promise<string> {
  try {
    const raw = localStorage.getItem('rep-erp-auth')
    if (raw) {
      const u = JSON.parse(raw)
      if (u && (u.name || u.username)) return u.name || u.username
    }
  } catch {}
  return '系统'
}

// ---------- 账号 / 登录 ----------
// 密码哈希：优先使用 Web Crypto SHA-256；否则降级为简单哈希（离线本地工具，非明文存储）
export async function hashPassword(pw: string): Promise<string> {
  try {
    const subtle = (globalThis as any).crypto?.subtle
    if (subtle) {
      const data = new TextEncoder().encode(pw)
      const buf = await subtle.digest('SHA-256', data)
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      return 'sha256:' + hex
    }
  } catch {}
  let h = 5381
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0
  return 'djb2:' + h.toString(16)
}

// 首次启动写入默认账号（两个均为管理员）
export async function seedUsers() {
  const count = await db.users.count()
  if (count > 0) return
  const now = Date.now()
  const defaults: { username: string; password: string; name: string }[] = [
    { username: 'wanghuizhen', password: 'wanghuizhen123', name: '王慧珍' },
    { username: 'jinhuaqiang', password: 'jinhuaqiang123', name: '金华强' },
  ]
  for (const d of defaults) {
    const passwordHash = await hashPassword(d.password)
    await db.users.add({
      id: crypto.randomUUID(),
      username: d.username,
      name: d.name,
      passwordHash,
      role: 'admin',
      createdAt: now,
    })
  }
}

export async function verifyLogin(username: string, password: string): Promise<User | null> {
  const u = await db.users.where('username').equals(username).first()
  if (!u) return null
  const h = await hashPassword(password)
  if (u.passwordHash !== h) return null
  return u
}

export function listUsers(): Promise<User[]> {
  return db.users.orderBy('createdAt').toArray()
}

export async function addUser(data: { username: string; name?: string; password: string; role: 'admin' | 'viewer' }) {
  const exist = await db.users.where('username').equals(data.username).first()
  if (exist) throw new Error('用户名已存在')
  const passwordHash = await hashPassword(data.password)
  await db.users.add({
    id: crypto.randomUUID(),
    username: data.username,
    name: data.name,
    passwordHash,
    role: data.role,
    createdAt: Date.now(),
  })
}

export async function updateUserPassword(id: string, password: string) {
  const passwordHash = await hashPassword(password)
  await db.users.update(id, { passwordHash })
}

export async function updateUserRole(id: string, role: 'admin' | 'viewer') {
  await db.users.update(id, { role })
}

export async function deleteUser(id: string) {
  await db.users.delete(id)
}

// ---------- 操作日志 ----------
export async function addLog(
  entityType: OperationLog['entityType'],
  entityId: string,
  action: OperationLog['action'],
  content: string,
  entityCode?: string,
) {
  const operator = await getOperator()
  await db.logs.add({
    id: crypto.randomUUID(),
    entityType,
    entityId,
    entityCode,
    action,
    content,
    operator,
    time: Date.now(),
  })
}

// ---------- 库存联动核心逻辑 ----------
// order 引用 productId 或 partId。
// 进行中(lock): lockedStock += qty；成品还会按其 BOM 联动锁定零部件。
// 已完成(complete): stock -= qty；lockedStock -= qty（可用量不变，仅总库存减少）。
// 已取消(release): lockedStock -= qty（释放锁定）。
type StockMode = 'lock' | 'complete' | 'release'

async function adjustOne(
  table: Table<any, string>,
  id: string,
  qty: number,
  mode: StockMode,
) {
  const row = await table.get(id)
  if (!row) return
  const next = { ...row }
  if (mode === 'lock') {
    next.lockedStock = (next.lockedStock || 0) + qty
  } else if (mode === 'complete') {
    next.stock = (next.stock || 0) - qty
    next.lockedStock = Math.max(0, (next.lockedStock || 0) - qty)
  } else {
    next.lockedStock = Math.max(0, (next.lockedStock || 0) - qty)
  }
  await table.update(id, next)
}

// 根据订单计算需要调整的库存对象列表（含 BOM 联动）
async function stockOps(order: Order, qty: number): Promise<{ table: Table<any, string>; id: string; qty: number }[]> {
  const ops: { table: Table<any, string>; id: string; qty: number }[] = []
  if (order.productId) {
    ops.push({ table: db.products, id: order.productId, qty })
    const product = await db.products.get(order.productId)
    if (product && product.bom && product.bom.length) {
      for (const b of product.bom as BomItem[]) {
        ops.push({ table: db.parts, id: b.partId, qty: qty * b.quantity })
      }
    }
  }
  if (order.partId) {
    ops.push({ table: db.parts, id: order.partId, qty })
  }
  return ops
}

// 切换订单状态时维护库存。返回是否因库存不足被阻止。
export async function applyStock(order: Order, mode: StockMode): Promise<{ ok: boolean; reason?: string }> {
  if (mode === 'lock') {
    // 校验可用量是否足够（仅对直接引用对象做严格校验）
    if (order.productId) {
      const p = await db.products.get(order.productId)
      if (p && availableOf(p) < order.quantity)
        return { ok: false, reason: `成品「${p.name}」可用库存不足（剩余 ${availableOf(p)} < ${order.quantity}）` }
    }
    if (order.partId) {
      const p = await db.parts.get(order.partId)
      if (p && availableOf(p) < order.quantity)
        return { ok: false, reason: `零部件「${p.name}」可用库存不足（剩余 ${availableOf(p)} < ${order.quantity}）` }
    }
    // 若产品含 BOM，校验各零部件可用量
    if (order.productId) {
      const product = await db.products.get(order.productId)
      if (product && product.bom && product.bom.length) {
        for (const b of product.bom) {
          const part = await db.parts.get(b.partId)
          if (part && availableOf(part) < order.quantity * b.quantity)
            return {
              ok: false,
              reason: `零部件「${part.name}」可用库存不足（需 ${order.quantity * b.quantity}，剩余 ${availableOf(part)}）`,
            }
        }
      }
    }
  }
  const ops = await stockOps(order, order.quantity)
  for (const op of ops) await adjustOne(op.table, op.id, op.qty, mode)
  return { ok: true }
}

// ---------- 订单状态流转 ----------
export async function changeOrderStatus(orderId: string, to: Status): Promise<{ ok: boolean; reason?: string }> {
  const order = await db.orders.get(orderId)
  if (!order || order.deleted) return { ok: false, reason: '订单不存在' }
  const from = order.status
  if (from === to) return { ok: true }

  // 先尝试库存操作（保证数据一致性）
  let stockResult: { ok: boolean; reason?: string } = { ok: true }
  if (from === 'processing' && to === 'completed') {
    stockResult = await applyStock(order, 'complete')
  } else if (from === 'processing' && to === 'cancelled') {
    stockResult = await applyStock(order, 'release')
  } else if (from === 'completed' && to === 'processing') {
    // 撤销完成：恢复库存（先释放后锁定回）
    stockResult = await applyStock(order, 'release')
    if (stockResult.ok) stockResult = await applyStock(order, 'lock')
  } else if (from === 'cancelled' && to === 'processing') {
    stockResult = await applyStock(order, 'lock')
  }
  if (!stockResult.ok) return stockResult

  const entry: StatusLogEntry = { time: Date.now(), from, to, operator: await getOperator() }
  const statusLog = [...(order.statusLog || []), entry]
  const actualDeliveryDate =
    to === 'completed' ? order.actualDeliveryDate || Date.now() : to === 'processing' ? undefined : order.actualDeliveryDate
  await db.orders.update(orderId, {
    status: to,
    statusLog,
    actualDeliveryDate,
    updatedAt: Date.now(),
  })
  await addLog('order', orderId, 'status', `状态变更：${labelOf(from)} → ${labelOf(to)}`, order.code)
  return { ok: true }
}

function labelOf(s: Status | 'none') {
  return s === 'none' ? '新建' : s === 'processing' ? '进行中' : s === 'completed' ? '已完成' : '已取消'
}

// 新增订单（默认 processing 并触发锁定）
export async function createOrder(data: Omit<Order, 'id' | 'code' | 'status' | 'statusLog' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const code = await genCode('order')
  const order: Order = {
    ...data,
    id: crypto.randomUUID(),
    code,
    status: 'processing',
    statusLog: [{ time: Date.now(), from: 'none', to: 'processing', operator: await getOperator() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  // 锁定库存
  const r = await applyStock(order, 'lock')
  if (!r.ok) return { ok: false, reason: r.reason }
  await db.orders.add(order)
  await addLog('order', order.id, 'create', `新建订单 ${code}，金额 ¥${order.totalAmount}`, code)
  return { ok: true, order }
}

// 软删除订单时释放锁定
export async function softDeleteOrder(orderId: string) {
  const order = await db.orders.get(orderId)
  if (!order) return
  if (order.status === 'processing') await applyStock(order, 'release')
  await db.orders.update(orderId, { deleted: true, updatedAt: Date.now() })
  await addLog('order', orderId, 'delete', `删除订单 ${order.code}`, order.code)
}

export async function softDeleteEntity(
  kind: 'supplier' | 'buyer' | 'product' | 'part',
  id: string,
) {
  const tableMap: any = {
    supplier: db.suppliers,
    buyer: db.buyers,
    product: db.products,
    part: db.parts,
  }
  const table = tableMap[kind]
  const row = await table.get(id)
  if (!row) return
  await table.update(id, { deleted: true, updatedAt: Date.now() })
  await addLog(kind, id, 'delete', `删除 ${row.name || row.code}`, row.code)
}

export async function restoreEntity(
  kind: 'supplier' | 'buyer' | 'product' | 'part' | 'order',
  id: string,
) {
  const tableMap: any = {
    supplier: db.suppliers,
    buyer: db.buyers,
    product: db.products,
    part: db.parts,
    order: db.orders,
  }
  const table = tableMap[kind]
  const row = await table.get(id)
  if (!row) return
  await table.update(id, { deleted: false, updatedAt: Date.now() })
  await addLog(kind, id, 'restore', `恢复 ${row.code || row.name}`, row.code)
}

// 删除订单关联时同步释放库存（用于删除产品/零部件前）
export async function releaseStockForEntity(kind: 'product' | 'part', id: string) {
  const orders = await db.orders.where('deleted').notEqual(1).filter((o: Order) => !o.deleted).toArray()
  for (const o of orders) {
    if (kind === 'product' && o.productId === id && o.status === 'processing') {
      await applyStock(o, 'release')
    }
    if (kind === 'part') {
      const product = o.productId ? await db.products.get(o.productId) : null
      const inBom = product?.bom?.some((b: BomItem) => b.partId === id)
      if ((o.partId === id || inBom) && o.status === 'processing') {
        await applyStock(o, 'release')
      }
    }
  }
}

// ---------- 快照备份 / 恢复 ----------
export async function exportSnapshot(): Promise<DbSnapshot> {
  const [suppliers, buyers, products, parts, orders, logs] = await Promise.all([
    db.suppliers.toArray(),
    db.buyers.toArray(),
    db.products.toArray(),
    db.parts.toArray(),
    db.orders.toArray(),
    db.logs.toArray(),
  ])
  return {
    version: 1,
    exportedAt: Date.now(),
    suppliers,
    buyers,
    products,
    parts,
    orders,
    logs,
  }
}

export async function importSnapshot(snap: DbSnapshot, merge = true) {
  if (!merge) {
    await db.transaction('rw', db.suppliers, db.buyers, db.products, db.parts, db.orders, db.logs, async () => {
      await Promise.all([
        db.suppliers.clear(),
        db.buyers.clear(),
        db.products.clear(),
        db.parts.clear(),
        db.orders.clear(),
        db.logs.clear(),
      ])
      await bulkPut(snap)
    })
  } else {
    await bulkPut(snap)
  }
}

async function bulkPut(snap: DbSnapshot) {
  if (snap.suppliers?.length) await db.suppliers.bulkPut(snap.suppliers)
  if (snap.buyers?.length) await db.buyers.bulkPut(snap.buyers)
  if (snap.products?.length) await db.products.bulkPut(snap.products)
  if (snap.parts?.length) await db.parts.bulkPut(snap.parts)
  if (snap.orders?.length) await db.orders.bulkPut(snap.orders)
  if (snap.logs?.length) await db.logs.bulkPut(snap.logs)
}

// ---------- 设置（角色 / 同步）持久化于 localStorage ----------
import { AppSettings, SyncSettings } from './types'

const SETTINGS_KEY = 'rep-erp-settings'

export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    currentUser: '管理员',
    role: 'admin',
    sync: { enabled: false, backendUrl: '', lastSyncAt: undefined },
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 兼容旧版存储：确保 sync 字段存在，避免 settings.sync.backendUrl 抛错
      return {
        ...defaults,
        ...parsed,
        sync: { ...defaults.sync, ...(parsed.sync || {}) },
      }
    }
  } catch {}
  return defaults
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function updateSyncSettings(patch: Partial<SyncSettings>) {
  const s = loadSettings()
  s.sync = { ...s.sync, ...patch }
  saveSettings(s)
}
