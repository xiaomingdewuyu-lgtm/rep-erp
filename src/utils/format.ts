import dayjs from 'dayjs'
import { Status } from '../types'

export function fmtDate(ts?: number) {
  return ts ? dayjs(ts).format('YYYY-MM-DD') : '-'
}

export function fmtDateTime(ts?: number) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

export function fmtMoney(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '¥0.00'
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtMoneyShort(n?: number) {
  if (n === undefined || n === null || isNaN(n)) return '¥0'
  if (Math.abs(n) >= 100000000) return `¥${(n / 100000000).toFixed(2)}亿`
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(2)}万`
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

export const STATUS_COLOR: Record<Status, string> = {
  processing: 'blue',
  completed: 'green',
  cancelled: 'default',
}

export const STATUS_TEXT: Record<Status, string> = {
  processing: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

export function matchKeyword(row: any, keys: string[], kw: string) {
  if (!kw) return true
  const lower = kw.toLowerCase().trim()
  return keys.some((k) => String(row[k] ?? '').toLowerCase().includes(lower))
}

// 判断订单是否临近交货（前 3 天内且未完成）
export function isNearDelivery(expected?: number, status?: Status) {
  if (!expected || status !== 'processing') return false
  const diff = dayjs(expected).diff(dayjs(), 'day')
  return diff >= 0 && diff <= 3
}

export function isOverdue(expected?: number, status?: Status) {
  if (!expected || status !== 'processing') return false
  return dayjs(expected).isBefore(dayjs(), 'day')
}
