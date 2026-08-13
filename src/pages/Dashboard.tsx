import { useMemo } from 'react'
import { Card, Row, Col, Statistic, List, Tag, Progress, Button, Space, Empty } from 'antd'
import { PlusOutlined, FileDoneOutlined, WarningOutlined, ClockCircleOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db, availableOf } from '../db'
import { Order, Product, Part } from '../types'
import { PageHeader, useCanEdit } from '../components/common'
import { fmtMoney, STATUS_TEXT, STATUS_COLOR, isNearDelivery, isOverdue, fmtDate } from '../utils/format'
import { useResponsive } from '../components/Layout'

export default function Dashboard() {
  const navigate = useNavigate()
  const isMobile = useResponsive()
  const canEdit = useCanEdit()

  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as Part[])
  const orders = useLiveQuery(() => db.orders.filter((o: Order) => !o.deleted).toArray(), [], [] as Order[])
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.deleted).toArray(), [], [] as any[])
  const buyers = useLiveQuery(() => db.buyers.filter((b) => !b.deleted).toArray(), [], [] as any[])

  const today = dayjs().format('YYYY-MM-DD')
  const stats = useMemo(() => {
    const list = (orders as Order[]) || []
    const todayNew = list.filter((o) => fmtDate(o.orderDate) === today).length
    const processing = list.filter((o) => o.status === 'processing').length
    const completed = list.filter((o) => o.status === 'completed').length
    const lowStock = [
      ...(products as Product[]).map((p) => ({ kind: '产品', name: p.name, available: availableOf(p), safety: p.safetyStock })),
      ...(parts as Part[]).map((p) => ({ kind: '零部件', name: p.name, available: availableOf(p), safety: p.safetyStock })),
    ].filter((i) => i.available < i.safety)
    const near = list.filter((o) => isNearDelivery(o.expectedDeliveryDate, o.status) || isOverdue(o.expectedDeliveryDate, o.status))
    const revenue = list.filter((o) => o.status === 'completed' && o.buyerId).reduce((s, o) => s + o.totalAmount, 0)
    const expected = list.filter((o) => o.status === 'processing').reduce((s, o) => s + o.totalAmount, 0)
    return { todayNew, processing, completed, lowStock, near, revenue, expected, total: list.length }
  }, [orders, products, parts])

  const recentOrders = useMemo(
    () => ((orders as Order[]) || []).slice().sort((a, b) => b.orderDate - a.orderDate).slice(0, 6),
    [orders],
  )

  const nameOf = (o: Order) => {
    const p = (products as Product[]).find((x) => x.id === o.productId)
    const pt = (parts as Part[]).find((x) => x.id === o.partId)
    return p?.name || pt?.name || '-'
  }

  return (
    <div>
      <PageHeader
        title="仪表盘"
        extra={
          canEdit ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/orders')}>
              新增订单
            </Button>
          ) : null
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card className="stat-card" style={{ borderRadius: 10 }} onClick={() => navigate('/orders')}>
            <Statistic title="今日新增订单" value={stats.todayNew} suffix="单" valueStyle={{ fontSize: isMobile ? 20 : 26 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card" style={{ borderRadius: 10 }} onClick={() => navigate('/orders?tab=processing')}>
            <Statistic title="待处理（进行中）" value={stats.processing} suffix="单" valueStyle={{ color: '#1677ff', fontSize: isMobile ? 20 : 26 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card" style={{ borderRadius: 10 }} onClick={() => navigate('/inventory/parts')}>
            <Statistic title="低库存预警" value={stats.lowStock.length} suffix="项" valueStyle={{ color: stats.lowStock.length ? '#cf1322' : '#389e0d', fontSize: isMobile ? 20 : 26 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card" style={{ borderRadius: 10 }} onClick={() => navigate('/orders?tab=processing')}>
            <Statistic title="临近/逾期交期" value={stats.near.length} suffix="单" valueStyle={{ color: stats.near.length ? '#fa8c16' : '#389e0d', fontSize: isMobile ? 20 : 26 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card className="stat-card" style={{ borderRadius: 10 }} onClick={() => navigate('/finance')}>
            <Statistic title="本年已完成收入" value={stats.revenue} precision={2} prefix="¥" valueStyle={{ color: '#cf1322' }} />
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>预计收入（进行中）{fmtMoney(stats.expected)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 10 }} onClick={() => navigate('/suppliers')}>
            <Statistic title="供应商" value={(suppliers as any[]).length} suffix="家" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 10 }} onClick={() => navigate('/buyers')}>
            <Statistic title="购买方" value={(buyers as any[]).length} suffix="家" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="最近订单" style={{ borderRadius: 10, height: '100%' }} extra={<Link to="/orders">全部 <RightOutlined /></Link>}>
            {recentOrders.length === 0 && <Empty description="暂无订单" />}
            <List
              dataSource={recentOrders}
              renderItem={(o: Order) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  actions={[<Tag color={STATUS_COLOR[o.status]}>{STATUS_TEXT[o.status]}</Tag>]}
                >
                  <List.Item.Meta
                    title={<span>{o.code} · {nameOf(o)}</span>}
                    description={`数量 ${o.quantity} · ${fmtMoney(o.totalAmount)} · 下单 ${fmtDate(o.orderDate)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={<span><WarningOutlined /> 低库存预警</span>}
            style={{ borderRadius: 10, marginBottom: 16 }}
            extra={<Link to="/inventory/parts">详情</Link>}
          >
            {stats.lowStock.length === 0 && <Empty description="库存充足" />}
            <List
              size="small"
              dataSource={stats.lowStock.slice(0, 8)}
              renderItem={(i: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Tag color="red">{i.kind}</Tag>}
                    description={i.name}
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div>剩余 {i.available}</div>
                    <div style={{ color: '#999', fontSize: 12 }}>安全 {i.safety}</div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
          <Card title={<span><ClockCircleOutlined /> 交期提醒</span>} style={{ borderRadius: 10 }} extra={<Link to="/orders">详情</Link>}>
            {stats.near.length === 0 && <Empty description="无临近交期" />}
            <List
              size="small"
              dataSource={stats.near.slice(0, 8)}
              renderItem={(o: Order) => (
                <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${o.id}`)}>
                  <List.Item.Meta
                    title={o.code}
                    description={`预计 ${fmtDate(o.expectedDeliveryDate)}`}
                  />
                  <Tag color={isOverdue(o.expectedDeliveryDate, o.status) ? 'volcano' : 'orange'}>
                    {isOverdue(o.expectedDeliveryDate, o.status) ? '已逾期' : '临近'}
                  </Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
