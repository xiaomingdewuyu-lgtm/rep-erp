import { useState } from 'react'
import { Card, Descriptions, Tag, Button, Space, Steps, Popconfirm, message, Result } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, changeOrderStatus, softDeleteOrder } from '../db'
import { Order, Supplier, Buyer, Product, Part } from '../types'
import { PageHeader, useCanEdit } from '../components/common'
import { fmtDate, fmtDateTime, STATUS_TEXT, STATUS_COLOR, fmtMoney } from '../utils/format'

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [confirming, setConfirming] = useState(false)

  const order = useLiveQuery(() => (id ? db.orders.get(id) : undefined), [id]) as Order | undefined
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [] as Supplier[])
  const buyers = useLiveQuery(() => db.buyers.toArray(), [], [] as Buyer[])
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.toArray(), [], [] as Part[])

  if (!order) {
    return <Result status="404" title="订单不存在" extra={<Button onClick={() => navigate('/orders')}>返回订单列表</Button>} />
  }

  const supplier = (suppliers as Supplier[]).find((s) => s.id === order.supplierId)
  const buyer = (buyers as Buyer[]).find((b) => b.id === order.buyerId)
  const product = (products as Product[]).find((p) => p.id === order.productId)
  const part = (parts as Part[]).find((p) => p.id === order.partId)
  const itemName = product?.name || part?.name || '-'

  async function changeStatus(to: 'processing' | 'completed' | 'cancelled') {
    const r = await changeOrderStatus(order!.id, to)
    if (!r.ok) message.error(r.reason)
    else message.success('状态已更新，库存已同步')
  }

  const current = order.status === 'completed' ? 2 : order.status === 'cancelled' ? 3 : 1

  return (
    <div>
      <PageHeader
        title={`订单 ${order.code}`}
        breadcrumb={[{ label: '订单', to: '/orders' }, { label: order.code }]}
        extra={
          <Space wrap>
            <Popconfirm
              title="确认删除该订单？"
              description="删除将释放其锁定的库存"
              onConfirm={async () => {
                await softDeleteOrder(order!.id)
                message.success('已删除')
                navigate('/orders')
              }}
              disabled={!canEdit}
            >
              <Button danger disabled={!canEdit}>
                删除
              </Button>
            </Popconfirm>
            <Button onClick={() => navigate('/orders')}>返回</Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 16, borderRadius: 10 }}>
        <Steps
          current={current}
          status={order.status === 'cancelled' ? 'error' : 'process'}
          size="small"
          items={[
            { title: '已下单' },
            { title: '进行中', description: '已锁定库存' },
            { title: '已完成', description: '已扣减库存' },
          ]}
        />
      </Card>

      <Card title="基本信息" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="订单编号">{order.code}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={STATUS_COLOR[order.status]}>{STATUS_TEXT[order.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="金额">{fmtMoney(order.totalAmount)}</Descriptions.Item>
          <Descriptions.Item label="下单时间">{fmtDate(order.orderDate)}</Descriptions.Item>
          <Descriptions.Item label="预计交货">{fmtDate(order.expectedDeliveryDate)}</Descriptions.Item>
          <Descriptions.Item label="实际交货">{fmtDate(order.actualDeliveryDate)}</Descriptions.Item>
          <Descriptions.Item label="备注" span={3}>
            {order.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="关联方" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="供应商">
            {supplier ? <Link to={`/suppliers/${supplier.id}/orders`}>{supplier.name}</Link> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="购买方">
            {buyer ? <Link to={`/buyers/${buyer.id}/orders`}>{buyer.name}</Link> : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="产品明细" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label="名称">
            {product ? <Link to={`/products/${product.id}/orders`}>{product.name}</Link> : part?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="规格/编号">{product?.code || part?.code}</Descriptions.Item>
          <Descriptions.Item label="数量">{order.quantity}</Descriptions.Item>
          <Descriptions.Item label="单价">¥{order.unitPrice}</Descriptions.Item>
          <Descriptions.Item label="小计" span={4}>
            <b>{fmtMoney(order.totalAmount)}</b>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="状态变更日志" style={{ marginBottom: 16, borderRadius: 10 }}>
        {!order.statusLog?.length && <div style={{ color: '#999' }}>暂无记录</div>}
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={(order.statusLog || []).map((s) => ({
            title: `${s.from === 'none' ? '新建' : STATUS_TEXT[s.from]} → ${STATUS_TEXT[s.to]}`,
            description: `${fmtDateTime(s.time)} · ${s.operator}`,
          }))}
        />
      </Card>

      {canEdit && (
        <Card title="操作" style={{ borderRadius: 10 }}>
          <Space wrap>
            {order.status !== 'processing' && (
              <Button onClick={() => changeStatus('processing')}>设为进行中（锁定库存）</Button>
            )}
            {order.status !== 'completed' && (
              <Popconfirm title="确认完成？将扣减库存" onConfirm={() => changeStatus('completed')}>
                <Button type="primary">标记为已完成（扣减库存）</Button>
              </Popconfirm>
            )}
            {order.status !== 'cancelled' && (
              <Popconfirm title="确认取消？将释放锁定库存" onConfirm={() => changeStatus('cancelled')}>
                <Button danger>取消订单（释放库存）</Button>
              </Popconfirm>
            )}
          </Space>
        </Card>
      )}
    </div>
  )
}
