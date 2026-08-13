import { useState, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, Space, Table, Tag, Segmented, Empty } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '../db'
import { Order } from '../types'
import { PageHeader } from '../components/common'
import { computeFinance, monthlySeries } from '../utils/finance'
import { fmtMoney, fmtMoneyShort } from '../utils/format'
import { exportToExcel } from '../utils/excel'
import { ImportExportBar } from '../components/common'
import { useResponsive } from '../components/Layout'

export default function Finance() {
  const navigate = useNavigate()
  const isMobile = useResponsive()
  const now = dayjs()
  const [year, setYear] = useState(now.year())
  const [month, setMonth] = useState<number | 'all'>('all')

  const orders = useLiveQuery(() => db.orders.filter((o: Order) => !o.deleted).toArray(), [], [] as Order[])

  const summary = useMemo(
    () => computeFinance((orders as Order[]) || [], year, month === 'all' ? undefined : month),
    [orders, year, month],
  )
  const series = useMemo(() => monthlySeries((orders as Order[]) || [], year), [orders, year])

  const yearOptions = useMemo(() => {
    const years = new Set<number>([now.year()])
    ;(orders as Order[]).forEach((o) => years.add(new Date(o.orderDate).getFullYear()))
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ label: `${y} 年`, value: y }))
  }, [orders])

  const qs = (scope: string) => {
    const p = new URLSearchParams({ scope, year: String(year) })
    if (month !== 'all') p.set('month', String(month))
    return `/orders?${p.toString()}`
  }

  const cards = [
    {
      title: '总收入（已完成·销售）',
      value: summary.revenue,
      color: '#cf1322',
      icon: <ArrowUpOutlined />,
      onClick: () => navigate(qs('revenue')),
    },
    {
      title: '总支出（已完成·采购）',
      value: summary.expense,
      color: '#389e0d',
      icon: <ArrowDownOutlined />,
      onClick: () => navigate(qs('expense')),
    },
    {
      title: '净收入',
      value: summary.net,
      color: summary.net >= 0 ? '#cf1322' : '#389e0d',
      icon: <WalletOutlined />,
      onClick: () => navigate(`/orders?scope=revenue&year=${year}`),
    },
    {
      title: '预计收入（进行中）',
      value: summary.expected,
      color: '#1677ff',
      icon: <ClockCircleOutlined />,
      onClick: () => navigate(qs('expected')),
    },
  ]

  const maxVal = Math.max(...series.map((s) => Math.max(s.revenue, s.expense)), 1)

  return (
    <div>
      <PageHeader
        title="金额报表"
        breadcrumb={[{ label: '金额' }]}
        extra={
          <Space wrap>
            <Select value={year} onChange={setYear} options={yearOptions} style={{ width: 120 }} />
            <Select
              value={month}
              onChange={setMonth}
              style={{ width: 140 }}
              options={[
                { label: '全年累计', value: 'all' },
                ...Array.from({ length: 12 }, (_, i) => ({ label: `截至 ${i + 1} 月`, value: i + 1 })),
              ]}
            />
            <ImportExportBar
              onExport={() =>
                exportToExcel(
                  series.map((s) => ({
                    month: `${year}-${String(s.month).padStart(2, '0')}`,
                    revenue: s.revenue,
                    expense: s.expense,
                    net: s.net,
                    expected: s.expected,
                  })),
                  [
                    { key: 'month', title: '月份(累计至)' },
                    { key: 'revenue', title: '总收入' },
                    { key: 'expense', title: '总支出' },
                    { key: 'net', title: '净收入' },
                    { key: 'expected', title: '预计收入' },
                  ],
                  `财务报表_${year}`,
                )
              }
            />
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <Col xs={12} md={6} key={c.title}>
            <Card className="stat-card" style={{ borderRadius: 10 }} onClick={c.onClick} hoverable>
              <Statistic
                title={<span style={{ fontSize: isMobile ? 12 : 14 }}>{c.title}</span>}
                value={c.value}
                precision={2}
                prefix="¥"
                valueStyle={{ color: c.color, fontSize: isMobile ? 18 : 24 }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>点击查看明细 →</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title={`${year} 年逐月走势（累计）`} style={{ borderRadius: 10, marginBottom: 16 }}>
        {/* 轻量柱状图，避免引入图表库 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 4 : 10, height: 180, overflowX: 'auto', paddingBottom: 8 }}>
          {series.map((s) => {
            const rh = (s.revenue / maxVal) * 140
            const eh = (s.expense / maxVal) * 140
            return (
              <div key={s.month} style={{ flex: '1 0 auto', minWidth: isMobile ? 34 : 46, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 145 }}>
                  <div
                    title={`收入 ${fmtMoney(s.revenue)}`}
                    style={{ width: isMobile ? 10 : 16, height: Math.max(2, rh), background: '#ff4d4f', borderRadius: '3px 3px 0 0' }}
                  />
                  <div
                    title={`支出 ${fmtMoney(s.expense)}`}
                    style={{ width: isMobile ? 10 : 16, height: Math.max(2, eh), background: '#52c41a', borderRadius: '3px 3px 0 0' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>{s.month}月</div>
              </div>
            )
          })}
        </div>
        <Space style={{ marginTop: 8 }}>
          <Tag color="red">收入</Tag>
          <Tag color="green">支出</Tag>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>（按中国习惯：红涨绿跌）</span>
        </Space>
      </Card>

      <Card title="逐月明细" style={{ borderRadius: 10 }}>
        <Table
          size="small"
          rowKey="month"
          scroll={{ x: 'max-content' }}
          pagination={false}
          dataSource={series}
          columns={[
            { title: '月份', dataIndex: 'month', render: (v: number) => `${year}-${String(v).padStart(2, '0')}` },
            { title: '总收入', dataIndex: 'revenue', align: 'right', render: (v: number) => <span style={{ color: '#cf1322' }}>{fmtMoney(v)}</span> },
            { title: '总支出', dataIndex: 'expense', align: 'right', render: (v: number) => <span style={{ color: '#389e0d' }}>{fmtMoney(v)}</span> },
            { title: '净收入', dataIndex: 'net', align: 'right', render: (v: number) => <b>{fmtMoney(v)}</b> },
            { title: '预计收入', dataIndex: 'expected', align: 'right', render: (v: number) => fmtMoney(v) },
          ]}
        />
      </Card>
    </div>
  )
}
