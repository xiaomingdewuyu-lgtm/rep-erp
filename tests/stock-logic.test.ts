// 核心库存联动逻辑验证（使用 fake-indexeddb 在 Node 中跑真实 db.ts）
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto

// localStorage polyfill（db.ts 的 loadSettings 需要）
const store: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
}

const { db, createOrder, changeOrderStatus, softDeleteOrder, availableOf, genCode } = await import('../src/db')

let pass = 0
let fail = 0
function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ✓ ${label}: ${actual}`) }
  else { fail++; console.log(`  ✗ ${label}: 期望 ${expected}，实际 ${actual}`) }
}

console.log('\n=== 准备数据：1 个成品(执手锁) + BOM 2 个零部件 ===')
const partCore = { id: 'p-core', code: 'PAR-001', name: '锁芯', unitPrice: 5, safetyStock: 10, stock: 100, lockedStock: 0, createdAt: Date.now(), updatedAt: Date.now() }
const partPanel = { id: 'p-panel', code: 'PAR-002', name: '面板', unitPrice: 8, safetyStock: 10, stock: 50, lockedStock: 0, createdAt: Date.now(), updatedAt: Date.now() }
await db.parts.bulkAdd([partCore as any, partPanel as any])

// 一个成品需要 2 个锁芯 + 1 个面板
const product = {
  id: 'prod-1', code: 'PRO-001', name: '执手锁A型', unitPrice: 120, safetyStock: 5,
  stock: 30, lockedStock: 0,
  bom: [{ partId: 'p-core', quantity: 2 }, { partId: 'p-panel', quantity: 1 }],
  createdAt: Date.now(), updatedAt: Date.now(),
}
await db.products.add(product as any)
await db.buyers.add({ id: 'b1', code: 'BUY-001', name: '经销商甲', createdAt: Date.now(), updatedAt: Date.now() } as any)

console.log('\n=== 1) 创建订单 10 件 → 应锁定库存（含 BOM 联动） ===')
const res = await createOrder({
  buyerId: 'b1', productId: 'prod-1', quantity: 10,
  unitPrice: 120, totalAmount: 1200, orderDate: Date.now(),
} as any)
console.log('  创建结果:', res.ok ? '成功 ' + res.order!.code : '失败 ' + res.reason)

let p = await db.products.get('prod-1')
let c = await db.parts.get('p-core')
let pa = await db.parts.get('p-panel')
check('成品锁定量 (10)', p!.lockedStock, 10)
check('成品可用量 (30-10=20)', availableOf(p!), 20)
check('锁芯锁定量 (10*2=20)', c!.lockedStock, 20)
check('锁芯可用量 (100-20=80)', availableOf(c!), 80)
check('面板锁定量 (10*1=10)', pa!.lockedStock, 10)
check('面板可用量 (50-10=40)', availableOf(pa!), 40)
check('成品总库存未变 (30)', p!.stock, 30)

console.log('\n=== 2) 订单标记已完成 → 应扣减总库存、释放锁定 ===')
await changeOrderStatus(res.order!.id, 'completed')
p = await db.products.get('prod-1'); c = await db.parts.get('p-core'); pa = await db.parts.get('p-panel')
check('成品总库存 (30-10=20)', p!.stock, 20)
check('成品锁定量归零', p!.lockedStock, 0)
check('成品可用量 (20)', availableOf(p!), 20)
check('锁芯总库存 (100-20=80)', c!.stock, 80)
check('锁芯锁定量归零', c!.lockedStock, 0)
check('面板总库存 (50-10=40)', pa!.stock, 40)

console.log('\n=== 3) 新订单后取消 → 应释放锁定，库存复原 ===')
const res2 = await createOrder({ buyerId: 'b1', productId: 'prod-1', quantity: 5, unitPrice: 120, totalAmount: 600, orderDate: Date.now() } as any)
c = await db.parts.get('p-core')
check('取消前锁芯锁定 (5*2=10)', c!.lockedStock, 10)
await changeOrderStatus(res2.order!.id, 'cancelled')
p = await db.products.get('prod-1'); c = await db.parts.get('p-core')
check('取消后成品锁定归零', p!.lockedStock, 0)
check('取消后锁芯锁定归零', c!.lockedStock, 0)
check('取消后锁芯总库存不变 (80)', c!.stock, 80)

console.log('\n=== 4) 库存不足时应阻止下单 ===')
const res3 = await createOrder({ buyerId: 'b1', productId: 'prod-1', quantity: 9999, unitPrice: 120, totalAmount: 1, orderDate: Date.now() } as any)
check('超量下单被拒绝', res3.ok, false)
console.log('  拒绝原因:', res3.reason)

console.log('\n=== 5) 删除进行中订单 → 应释放锁定 ===')
const res4 = await createOrder({ buyerId: 'b1', productId: 'prod-1', quantity: 3, unitPrice: 120, totalAmount: 360, orderDate: Date.now() } as any)
c = await db.parts.get('p-core')
check('删除前锁芯锁定 (3*2=6)', c!.lockedStock, 6)
await softDeleteOrder(res4.order!.id)
c = await db.parts.get('p-core')
check('删除后锁芯锁定归零', c!.lockedStock, 0)

console.log('\n=== 6) 唯一编号生成 ===')
const code1 = await genCode('supplier')
await db.suppliers.add({ id: 's1', code: code1, name: 'A', createdAt: Date.now(), updatedAt: Date.now() } as any)
const code2 = await genCode('supplier')
console.log(`  生成编号: ${code1} → ${code2}`)
check('编号递增且不重复', code1 !== code2, true)

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`)
process.exit(fail > 0 ? 1 : 0)
