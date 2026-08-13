import { useState, useMemo } from 'react'
import { Card, Tabs, Tag, Descriptions, Button, Space } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { Order, Product, Buyer } from '../types'
import { PageHeader } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { fmtDate, STATUS_TEXT, STATUS_COLOR } from '../utils/format'

export default function ProductOrders() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')

  const product = useLiveQuery(() => (id ? db.products.get(id) : undefined), [id]) as Product | undefined
  const orders = useLiveQuery(
    () => db.orders.filter((o: Order) => !o.deleted && o.productId === id).toArray(),
    [id],
    [] as Order[],
  )
  const buyers = useLiveQuery(() => db.buyers.filter((b) => !b.deleted).toArray(), [], [] as Buyer[])
  const buyerName = (bid?: string) => (buyers as Buyer[]).find((b) => b.id === bid)?.name || '-'

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
    { key: 'orderDate', title: '下单时间', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'expectedDeliveryDate', title: '预计交货', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'actualDeliveryDate', title: '实际交货', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'quantity', title: '数量', width: 90, align: 'right' },
    { key: 'totalAmount', title: '金额', width: 120, align: 'right', render: (v: number) => `¥${v?.toLocaleString()}` },
    { key: 'status', title: '状态', width: 100, render: (v: Order['status']) => <Tag color={STATUS_COLOR[v]}>{STATUS_TEXT[v]}</Tag> },
    { key: 'buyerId', title: '购买方', width: 160, render: (_: any, r: Order) => buyerName(r.buyerId) },
  ]

  return (
    <div>
      <PageHeader
        title="产品关联订单"
        breadcrumb={[
          { label: '产品目录', to: '/products' },
          { label: product?.name || '...' },
        ]}
        extra={<Button onClick={() => navigate('/products')}>返回</Button>}
      />
      <Card style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions title={product?.name} column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="编号">{product?.code}</Descriptions.Item>
          <Descriptions.Item label="单价">¥{product?.unitPrice}</Descriptions.Item>
          <Descriptions.Item label="总库存">{product?.stock}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'all', label: `全部 (${((orders as Order[]) || []).length})` },
          { key: 'processing', label: `进行中 (${((orders as Order[]) || []).filter((o) => o.status === 'processing').length})` },
          { key: 'completed', label: `已完成 (${((orders as Order[]) || []).filter((o) => o.status === 'completed').length})` },
        ]}
      />
      <ResponsiveTable rowKey="id" columns={columns} dataSource={filtered} onRowClick={(r) => navigate(`/orders/${r.id}`)} />
    </div>
  )
}
