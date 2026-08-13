import { useState, useMemo } from 'react'
import { Tag, Space, Card, Descriptions, Alert, Progress, Button, Statistic, Row, Col } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, availableOf } from '../db'
import { Product, Part } from '../types'
import { PageHeader, SearchBar } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { exportToExcel } from '../utils/excel'
import { ImportExportBar } from '../components/common'

type Target = 'products' | 'parts' | 'productParts'

export default function Inventory({ target }: { target: Target }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [kw, setKw] = useState('')

  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as Part[])
  const product = useLiveQuery(() => (id ? db.products.get(id) : undefined), [id]) as Product | undefined

  // 注意：所有 Hook 必须在任何条件性 return 之前调用
  const bomRows = useMemo(() => {
    if (!product) return []
    return (product.bom || []).map((b) => {
      const part = (parts as Part[]).find((p) => p.id === b.partId)
      return {
        id: b.partId,
        code: part?.code || '-',
        name: part?.name || '（零部件已删除）',
        perUnit: b.quantity,
        stock: part?.stock ?? 0,
        lockedStock: part?.lockedStock ?? 0,
        safetyStock: part?.safetyStock ?? 0,
        available: part ? availableOf(part) : 0,
        buildable: part && b.quantity > 0 ? Math.floor(availableOf(part) / b.quantity) : 0,
      }
    })
  }, [product, parts])

  const baseColumns = (kindLabel: string): ResponsiveColumn<any>[] => [
    { key: 'code', title: '编号', width: 130 },
    {
      key: 'name',
      title: '名称',
      width: 200,
      primary: true,
      render: (v: string, r: any) =>
        target === 'products' ? <Link to={`/inventory/products/${r.id}/parts`}>{v}</Link> : v,
    },
    {
      key: 'stock',
      title: '总库存',
      width: 110,
      align: 'right',
      render: (v: number) => <b>{v}</b>,
    },
    {
      key: 'lockedStock',
      title: '锁定量',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: v > 0 ? '#1677ff' : undefined }}>{v}</span>,
    },
    {
      key: 'available',
      title: '剩余量',
      width: 110,
      align: 'right',
      render: (_: any, r: any) => {
        const a = availableOf(r)
        const danger = a < r.safetyStock
        return (
          <span style={{ color: danger ? '#cf1322' : '#389e0d', fontWeight: 600 }}>
            {a}
            {danger && (
              <Tag color="red" style={{ marginLeft: 6 }}>
                低
              </Tag>
            )}
          </span>
        )
      },
    },
    { key: 'safetyStock', title: '安全库存', width: 100, align: 'right', hideOnMobile: true },
    {
      key: 'usage',
      title: '库存占用',
      width: 150,
      hideOnMobile: true,
      render: (_: any, r: any) => {
        const pct = r.stock > 0 ? Math.round((r.lockedStock / r.stock) * 100) : 0
        return <Progress percent={pct} size="small" status={pct >= 100 ? 'exception' : 'active'} />
      },
    },
  ]

  // ===== 视图 1：产品库存 =====
  if (target === 'products') {
    const filtered = (products as Product[]).filter(
      (r) => !kw || `${r.name}${r.code}`.toLowerCase().includes(kw.toLowerCase()),
    )
    return (
      <div>
        <PageHeader
          title="产品库存"
          breadcrumb={[{ label: '库存' }, { label: '产品库存' }]}
          extra={
            <Space wrap>
              <SearchBar value={kw} onChange={setKw} />
              <ImportExportBar
                onExport={() =>
                  exportToExcel(
                    filtered.map((r) => ({ ...r, available: availableOf(r) })),
                    [
                      { key: 'code', title: '产品编号' },
                      { key: 'name', title: '名称' },
                      { key: 'stock', title: '总库存' },
                      { key: 'lockedStock', title: '锁定量' },
                      { key: 'available', title: '剩余量' },
                      { key: 'safetyStock', title: '安全库存' },
                    ],
                    '产品库存',
                  )
                }
              />
            </Space>
          }
        />
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="点击产品名称可查看该产品的零部件（BOM）库存明细。总库存 = 锁定量 + 剩余量。"
        />
        <ResponsiveTable
          rowKey="id"
          columns={baseColumns('产品')}
          dataSource={filtered}
          onRowClick={(r) => navigate(`/inventory/products/${r.id}/parts`)}
        />
      </div>
    )
  }

  // ===== 视图 2：零部件库存 =====
  if (target === 'parts') {
    const filtered = (parts as Part[]).filter(
      (r) => !kw || `${r.name}${r.code}`.toLowerCase().includes(kw.toLowerCase()),
    )
    return (
      <div>
        <PageHeader
          title="零部件库存"
          breadcrumb={[{ label: '库存' }, { label: '零部件库存' }]}
          extra={
            <Space wrap>
              <SearchBar value={kw} onChange={setKw} />
              <ImportExportBar
                onExport={() =>
                  exportToExcel(
                    filtered.map((r) => ({ ...r, available: availableOf(r) })),
                    [
                      { key: 'code', title: '零部件编号' },
                      { key: 'name', title: '名称' },
                      { key: 'stock', title: '总库存' },
                      { key: 'lockedStock', title: '锁定量' },
                      { key: 'available', title: '剩余量' },
                      { key: 'safetyStock', title: '安全库存' },
                    ],
                    '零部件库存',
                  )
                }
              />
            </Space>
          }
        />
        <ResponsiveTable rowKey="id" columns={baseColumns('零部件')} dataSource={filtered} />
      </div>
    )
  }

  // ===== 视图 3：某产品的零部件（BOM）库存明细 =====
  const maxBuildable = bomRows.length ? Math.min(...bomRows.map((r) => r.buildable)) : 0

  const bomColumns: ResponsiveColumn<any>[] = [
    { key: 'code', title: '零部件编号', width: 130 },
    { key: 'name', title: '名称', width: 180, primary: true },
    { key: 'perUnit', title: '单件用量', width: 100, align: 'right' },
    { key: 'stock', title: '总库存', width: 100, align: 'right' },
    { key: 'lockedStock', title: '锁定量', width: 100, align: 'right' },
    {
      key: 'available',
      title: '剩余量',
      width: 110,
      align: 'right',
      render: (v: number, r: any) => (
        <span style={{ color: v < r.safetyStock ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{v}</span>
      ),
    },
    {
      key: 'buildable',
      title: '可支撑产量',
      width: 120,
      align: 'right',
      render: (v: number) => <Tag color={v === maxBuildable ? 'orange' : 'blue'}>{v} 件</Tag>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="产品零部件库存明细"
        breadcrumb={[
          { label: '库存' },
          { label: '产品库存', to: '/inventory/products' },
          { label: product?.name || '...' },
        ]}
        extra={<Button onClick={() => navigate('/inventory/products')}>返回</Button>}
      />
      <Card style={{ marginBottom: 16, borderRadius: 10 }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Statistic title="产品编号" value={product?.code || '-'} valueStyle={{ fontSize: 16 }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="成品总库存" value={product?.stock ?? 0} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="成品锁定量" value={product?.lockedStock ?? 0} valueStyle={{ color: '#1677ff' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="零部件可支撑产量"
              value={maxBuildable}
              suffix="件"
              valueStyle={{ color: maxBuildable > 0 ? '#389e0d' : '#cf1322' }}
            />
          </Col>
        </Row>
      </Card>
      {bomRows.length === 0 && (
        <Alert type="warning" showIcon message="该产品尚未配置 BOM 物料清单" description="请前往「产品目录 → 编辑」添加零部件组成。" style={{ marginBottom: 12 }} />
      )}
      <ResponsiveTable rowKey="id" columns={bomColumns} dataSource={bomRows} pagination={false} />
    </div>
  )
}
