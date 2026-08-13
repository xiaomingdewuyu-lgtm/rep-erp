// 全局类型定义

export type Status = 'processing' | 'completed' | 'cancelled'

export const STATUS_LABEL: Record<Status, string> = {
  processing: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

export interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Buyer {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface BomItem {
  partId: string
  quantity: number // 每单位产品所需该零部件数量
}

export interface Product {
  id: string
  code: string
  name: string
  description?: string
  unitPrice: number
  safetyStock: number
  stock: number // 成品库存（总库存）
  lockedStock: number // 锁定量
  bom: BomItem[] // 物料清单
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Part {
  id: string
  code: string
  name: string
  description?: string
  unitPrice: number
  safetyStock: number
  stock: number // 总库存
  lockedStock: number // 锁定量
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface StatusLogEntry {
  time: number
  from: Status | 'none'
  to: Status
  operator: string
}

export interface Order {
  id: string
  code: string
  supplierId?: string
  buyerId?: string
  productId?: string
  partId?: string
  quantity: number
  unitPrice: number
  totalAmount: number
  status: Status
  orderDate: number
  expectedDeliveryDate?: number
  actualDeliveryDate?: number
  remark?: string
  statusLog: StatusLogEntry[]
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface OperationLog {
  id: string
  entityType: 'supplier' | 'buyer' | 'product' | 'part' | 'order'
  entityId: string
  entityCode?: string
  action: 'create' | 'update' | 'delete' | 'restore' | 'status'
  content: string
  operator: string
  time: number
}

export interface SyncSettings {
  enabled: boolean
  backendUrl: string // 中央后端地址；留空表示同源（后端同时托管前端）
  lastSyncAt?: number
}

export type Role = 'admin' | 'viewer'

export interface User {
  id: string
  username: string
  name?: string
  passwordHash: string
  role: Role
  createdAt: number
}

export interface AppSettings {
  currentUser: string
  role: 'admin' | 'viewer'
  sync: SyncSettings
}

export interface DbSnapshot {
  version: number
  exportedAt: number
  suppliers: Supplier[]
  buyers: Buyer[]
  products: Product[]
  parts: Part[]
  orders: Order[]
  logs: OperationLog[]
}
