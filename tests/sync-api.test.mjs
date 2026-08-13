// 多用户真共享验证：模拟两个账号 A(wanghuizhen) / B(jinhuaqiang)
// 直接打后端 API，验证中央数据库 + 增量同步 + 账号权限。
const BASE = process.env.BASE || 'http://localhost:8787'

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅', name) }
  else { fail++; console.log('  ❌', name) }
}

async function api(path, token, body, method) {
  const m = method || (body ? 'POST' : 'GET')
  const res = await fetch(BASE + path, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

const now = () => Date.now()

async function main() {
  console.log('== 1. 登录两个账号 ==')
  const a = await api('/api/login', null, { username: 'wanghuizhen', password: 'wanghuizhen123' })
  const b = await api('/api/login', null, { username: 'jinhuaqiang', password: 'jinhuaqiang123' })
  check('A 登录成功且为管理员', a.status === 200 && a.data.user.role === 'admin' && !!a.data.token)
  check('B 登录成功且为管理员', b.status === 200 && !!b.data.token)
  const ta = a.data.token, tb = b.data.token

  console.log('== 2. 无 token 访问被拒 ==')
  const noTok = await api('/api/sync?since=0')
  check('无 token 返回 401', noTok.status === 401)
  const wrongPw = await api('/api/login', null, { username: 'wanghuizhen', password: 'bad' })
  check('错误密码返回 401', wrongPw.status === 401)

  console.log('== 3. A 新增供应商，B 能拉到 ==')
  const supId = 'sup-test-1'
  const t0 = now()
  await api('/api/sync', ta, { changes: [{ entity: 'suppliers', record: { id: supId, code: 'SUP-202608001', name: '供应商A创建', createdAt: t0, updatedAt: t0 } }] })
  const bPull = await api('/api/sync?since=0', tb)
  const supInB = (bPull.data.changes || []).find((c) => c.entity === 'suppliers' && c.record.id === supId)
  check('B 拉取到了 A 创建的供应商', !!supInB && supInB.record.name === '供应商A创建')

  console.log('== 4. B 修改该供应商，A 能拉到最新值 ==')
  const t1 = now() + 1000
  await api('/api/sync', tb, { changes: [{ entity: 'suppliers', record: { id: supId, code: 'SUP-202608001', name: '供应商B修改', createdAt: t0, updatedAt: t1 } }] })
  const aPull = await api('/api/sync?since=0', ta)
  const supInA = (aPull.data.changes || []).find((c) => c.entity === 'suppliers' && c.record.id === supId)
  check('A 拉取到了 B 修改后的值', !!supInA && supInA.record.name === '供应商B修改')

  console.log('== 5. 冲突按 updatedAt 最后写入胜出 ==')
  // A 用更旧的 updatedAt 回写旧值，应被服务端忽略
  await api('/api/sync', ta, { changes: [{ entity: 'suppliers', record: { id: supId, name: '供应商A旧值(应被忽略)', updatedAt: t0 - 999999 } }] })
  const aPull2 = await api('/api/sync?since=0', ta)
  const sup2 = (aPull2.data.changes || []).find((c) => c.entity === 'suppliers' && c.record.id === supId)
  check('旧时间戳的回写未覆盖新值', !!sup2 && sup2.record.name === '供应商B修改')

  console.log('== 6. B 删除供应商，A 拉到软删除标记 ==')
  await api('/api/sync', tb, { changes: [{ entity: 'suppliers', record: { id: supId, deleted: true, updatedAt: now() + 5000 } }] })
  const aPull3 = await api('/api/sync?since=0', ta)
  const sup3 = (aPull3.data.changes || []).find((c) => c.entity === 'suppliers' && c.record.id === supId)
  check('A 拉取到了 deleted=true 的墓碑', !!sup3 && sup3.record.deleted === true)

  console.log('== 7. 订单状态联动数据也能共享 ==')
  const ordId = 'ord-test-1'
  const ot = now()
  await api('/api/sync', ta, { changes: [{ entity: 'orders', record: { id: ordId, code: 'ORD-202608001', status: 'processing', quantity: 10, totalAmount: 1000, createdAt: ot, updatedAt: ot } }] })
  const bPullOrd = await api('/api/sync?since=0', tb)
  const ord = (bPullOrd.data.changes || []).find((c) => c.entity === 'orders' && c.record.id === ordId)
  check('B 拉取到了 A 创建的订单', !!ord && ord.record.status === 'processing')

  console.log('== 8. 账号管理（仅管理员）==')
  const listU = await api('/api/users', tb)
  check('B 可列出账号（含2个默认管理员）', listU.status === 200 && listU.data.users.length === 2)
  const addU = await api('/api/users', tb, { username: 'employee1', name: '员工一', password: 'emp123', role: 'viewer' })
  check('B 可新增只读账号', addU.status === 200 && !!addU.data.user)
  const listU2 = await api('/api/users', tb)
  check('新增后账号数为 3', listU2.data.users.length === 3)
  const newId = addU.data.user.id
  const roleU = await api(`/api/users/${newId}/role`, tb, { role: 'admin' }, 'PUT')
  check('B 可修改账号角色', roleU.status === 200)
  const delU = await api(`/api/users/${newId}`, tb, null, 'DELETE')
  check('B 可删除账号', delU.status === 200)

  console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
