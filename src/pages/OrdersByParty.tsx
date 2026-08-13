import { useState, useMemo } from 'react'
import { Card, Tabs, Tag, Descriptions, message, Space, Button } from 'antd'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { Order, Supplier, Buyer } from '../types'
import { PageHeader } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { fmtDate, STATUS_TEXT, STATUS_COLOR } from '../utils/format'

export default function OrdersByParty({ kind }: { kind: 'supplier' | 'buyer' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')

  const party = useLiveQuery(
    () => (kind === 'supplier' ? db.suppliers.get(id!) : db.buyers.get(id!)),
    [id],
  ) as Supplier | Buyer | undefined

  const orders = useLiveQuery(
    () =>
      db.orders
        .filter((o: Order) => !o.deleted && (kind === 'supplier' ? o.supplierId === id : o.buyerId === id))
        .toArray(),
    [id, kind],
    [] as Order[],
  )

  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as any[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as any[])

  const nameOf = (o: Order) => {
    if (o.productId) return (products as any[]).find((p) => p.id === o.productId)?.name || '（产品已删）'
    if (o.partId) return (parts as any[]).find((p) => p.id === o.partId)?.name || '（零部件已删）'
    return '-'
  }

  const filtered = useMemo(() => {
    const list = (orders as Order[]) || []
    if (tab === 'all') return list
    if (tab === 'processing') return list.filter((o) => o.status === 'processing')
    return list.filter((o) => o.status === 'completed')
  }, [orders, tab])

  const columns: ResponsiveColumn<Order>[] = [
    {
      key: 'code',
      title: '订单编号',
      width: 150,
      primary: true,
      render: (v: string, r: Order) => <Link to={`/orders/${r.id}`}>{v}</Link>,
    },
    { key: 'orderDate', title: '下单时间', width: 130, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'product', title: '产品/零部件', width: 180, render: (_: any, r: Order) => nameOf(r) },
    { key: 'quantity', title: '数量', width: 90, align: 'right' },
    { key: 'totalAmount', title: '金额', width: 120, align: 'right', render: (v: number) => `¥${v?.toLocaleString()}` },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (v: Order['status']) => <Tag color={STATUS_COLOR[v]}>{STATUS_TEXT[v]}</Tag>,
    },
    { key: 'expectedDeliveryDate', title: '预计交货', width: 130, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'actualDeliveryDate', title: '实际交货', width: 130, hideOnMobile: true, render: (v: number) => fmtDate(v) },
  ]

  const title = kind === 'supplier' ? '供应商' : '购买方'

  return (
    <div>
      <PageHeader
        title={`${title}订单`}
        breadcrumb={[
          { label: title, to: `/${kind}s` },
          { label: party?.name || '...' },
        ]}
        extra={
          <Button onClick={() => navigate(`/${kind}s`)}>返回列表</Button>
        }
      />
      <Card style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions title={party?.name} column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="编号">{party?.code}</Descriptions.Item>
          <Descriptions.Item label="联系人">{party?.contact || '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{party?.phone || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{party?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="地址">{party?.address || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'all', label: `全部 (${((orders as Order[]) || []).length})` },
          {
            key: 'processing',
            label: `进行中 (${((orders as Order[]) || []).filter((o) => o.status === 'processing').length})`,
          },
          {
            key: 'completed',
            label: `已完成 (${((orders as Order[]) || []).filter((o) => o.status === 'completed').length})`,
          },
        ]}
      />
      <ResponsiveTable rowKey="id" columns={columns} dataSource={filtered} onRowClick={(r) => navigate(`/orders/${r.id}`)} />
    </div>
  )
}
