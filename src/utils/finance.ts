import { Order } from '../types'

export interface FinanceSummary {
  revenue: number // 已完成·购买方订单（收入）
  expense: number // 已完成·供应商订单（支出）
  net: number // 净额
  expected: number // 进行中订单（预计收入）
}

export interface MonthPoint extends FinanceSummary {
  month: number // 1-12
}

function inScope(order: Order, year: number, month?: number): boolean {
  if (order.deleted) return false
  const d = new Date(order.orderDate)
  if (d.getFullYear() !== year) return false
  if (month !== undefined && d.getMonth() + 1 > month) return false
  return true
}

export function computeFinance(orders: Order[], year: number, month?: number): FinanceSummary {
  let revenue = 0
  let expense = 0
  let expected = 0
  for (const o of orders) {
    if (!inScope(o, year, month)) continue
    if (o.status === 'completed') {
      if (o.buyerId) revenue += o.totalAmount
      if (o.supplierId) expense += o.totalAmount
    } else if (o.status === 'processing') {
      expected += o.totalAmount
    }
  }
  return { revenue, expense, net: revenue - expense, expected }
}

// 全年 12 个月逐月累计（截至该月）
export function monthlySeries(orders: Order[], year: number): MonthPoint[] {
  const arr: MonthPoint[] = []
  for (let m = 1; m <= 12; m++) {
    arr.push({ month: m, ...computeFinance(orders, year, m) })
  }
  return arr
}

// 低库存预警：可用量 < 安全库存
export interface LowStockItem {
  kind: 'product' | 'part'
  id: string
  code: string
  name: string
  available: number
  safety: number
}
