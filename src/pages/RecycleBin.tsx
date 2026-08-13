import { useState } from 'react'
import { Card, Tabs, Button, Space, Tag, message, Popconfirm, Empty } from 'antd'
import { RollbackOutlined, DeleteOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, restoreEntity } from '../db'
import { Supplier, Buyer, Product, Part, Order } from '../types'
import { PageHeader } from '../components/common'
import { fmtDate } from '../utils/format'

export default function RecycleBin() {
  const [tab, setTab] = useState('supplier')

  const suppliers = useLiveQuery(() => db.suppliers.filter((x: Supplier) => x.deleted).toArray(), [], [] as Supplier[])
  const buyers = useLiveQuery(() => db.buyers.filter((x: Buyer) => x.deleted).toArray(), [], [] as Buyer[])
  const products = useLiveQuery(() => db.products.filter((x: Product) => x.deleted).toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.filter((x: Part) => x.deleted).toArray(), [], [] as Part[])
  const orders = useLiveQuery(() => db.orders.filter((x: Order) => x.deleted).toArray(), [], [] as Order[])

  const data: Record<string, { kind: any; rows: any[]; cols: { key: string; title: string }[] }> = {
    supplier: {
      kind: 'supplier',
      rows: suppliers as any[],
      cols: [
        { key: 'code', title: '编号' },
        { key: 'name', title: '名称' },
        { key: 'deletedAt', title: '删除时间' },
      ],
    },
    buyer: { kind: 'buyer', rows: buyers as any[], cols: [{ key: 'code', title: '编号' }, { key: 'name', title: '名称' }] },
    product: { kind: 'product', rows: products as any[], cols: [{ key: 'code', title: '编号' }, { key: 'name', title: '名称' }] },
    part: { kind: 'part', rows: parts as any[], cols: [{ key: 'code', title: '编号' }, { key: 'name', title: '名称' }] },
    order: { kind: 'order', rows: orders as any[], cols: [{ key: 'code', title: '编号' }, { key: 'totalAmount', title: '金额' }] },
  }

  const cur = data[tab]

  return (
    <div>
      <PageHeader title="回收站" breadcrumb={[{ label: '回收站' }]} extra={<span style={{ color: '#999' }}>软删除的数据可在此恢复</span>} />
      <Card style={{ borderRadius: 10 }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'supplier', label: `供应商 (${(suppliers as any[]).length})` },
            { key: 'buyer', label: `购买方 (${(buyers as any[]).length})` },
            { key: 'product', label: `产品 (${(products as any[]).length})` },
            { key: 'part', label: `零部件 (${(parts as any[]).length})` },
            { key: 'order', label: `订单 (${(orders as any[]).length})` },
          ]}
        />
        {cur.rows.length === 0 ? (
          <Empty description="回收站为空" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {cur.rows.map((r) => (
              <Card key={r.id} size="small" style={{ borderRadius: 8 }} hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Tag>{r.code}</Tag>
                    <b>{r.name || '订单'}</b>
                    {r.totalAmount && <span style={{ marginLeft: 8 }}>¥{r.totalAmount}</span>}
                  </div>
                  <Space>
                    <Button size="small" icon={<RollbackOutlined />} onClick={async () => { await restoreEntity(cur.kind, r.id); message.success('已恢复') }}>
                      恢复
                    </Button>
                    <Popconfirm title="永久删除？此操作不可恢复" onConfirm={() => message.info('永久删除需谨慎，可联系技术处理')}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </div>
  )
}
