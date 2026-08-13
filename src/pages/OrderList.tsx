import { useState, useMemo, useEffect } from 'react'
import {
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  message,
  Popconfirm,
  Space,
  Tag,
  Radio,
  Tabs,
  Alert,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs, { Dayjs } from 'dayjs'
import { db, createOrder, softDeleteOrder, changeOrderStatus } from '../db'
import { Order, Supplier, Buyer, Product, Part } from '../types'
import { PageHeader, SearchBar, ImportExportBar, useCanEdit } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { fmtDate, STATUS_TEXT, STATUS_COLOR, fmtMoney } from '../utils/format'
import { exportToExcel } from '../utils/excel'

export default function OrderList() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [searchParams] = useSearchParams()
  const scope = searchParams.get('scope') // revenue | expense | expected
  const [kw, setKw] = useState('')
  const [tab, setTab] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState<{ selectedRowKeys: React.Key[]; onChange: (k: React.Key[]) => void }>({
    selectedRowKeys: [],
    onChange: (k) => setRowSelection((s) => ({ ...s, selectedRowKeys: k })),
  })

  const orders = useLiveQuery(() => db.orders.filter((o: Order) => !o.deleted).toArray(), [], [] as Order[])
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.deleted).toArray(), [], [] as Supplier[])
  const buyers = useLiveQuery(() => db.buyers.filter((b) => !b.deleted).toArray(), [], [] as Buyer[])
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as Part[])

  const nameOf = (o: Order) => {
    if (o.productId) return (products as Product[]).find((p) => p.id === o.productId)?.name || '（产品已删）'
    if (o.partId) return (parts as Part[]).find((p) => p.id === o.partId)?.name || '（零部件已删）'
    return '-'
  }
  const supplierName = (id?: string) => (suppliers as Supplier[]).find((s) => s.id === id)?.name || '-'
  const buyerName = (id?: string) => (buyers as Buyer[]).find((b) => b.id === id)?.name || '-'

  // 来自「金额」页面的下钻筛选
  useEffect(() => {
    if (scope === 'revenue' || scope === 'expense') setTab('completed')
    else if (scope === 'expected') setTab('processing')
  }, [scope])

  const filtered = useMemo(() => {
    let list = (orders as Order[]) || []
    if (tab !== 'all') list = list.filter((o) => o.status === tab)
    // scope 下钻：收入=有购买方，支出=有供应商
    if (scope === 'revenue') list = list.filter((o) => !!o.buyerId)
    if (scope === 'expense') list = list.filter((o) => !!o.supplierId)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    if (year) list = list.filter((o) => new Date(o.orderDate).getFullYear() === Number(year))
    if (month) list = list.filter((o) => new Date(o.orderDate).getMonth() + 1 <= Number(month))
    if (kw) {
      const l = kw.toLowerCase()
      list = list.filter(
        (o) =>
          o.code.toLowerCase().includes(l) ||
          nameOf(o).toLowerCase().includes(l) ||
          supplierName(o.supplierId).toLowerCase().includes(l) ||
          buyerName(o.buyerId).toLowerCase().includes(l),
      )
    }
    return list.sort((a, b) => b.orderDate - a.orderDate)
  }, [orders, tab, kw, suppliers, buyers, products, parts, scope, searchParams])

  const scopeLabel =
    scope === 'revenue' ? '已完成 · 销售订单（收入）' : scope === 'expense' ? '已完成 · 采购订单（支出）' : scope === 'expected' ? '进行中订单（预计收入）' : ''

  const columns: ResponsiveColumn<Order>[] = [
    { key: 'code', title: '订单编号', width: 150, primary: true, render: (v: string, r: Order) => <Link to={`/orders/${r.id}`}>{v}</Link> },
    { key: 'orderDate', title: '下单时间', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'supplier', title: '供应商', width: 150, hideOnMobile: true, render: (_: any, r: Order) => <Link to={`/suppliers/${r.supplierId}/orders`}>{supplierName(r.supplierId)}</Link> },
    { key: 'buyer', title: '购买方', width: 150, hideOnMobile: true, render: (_: any, r: Order) => <Link to={`/buyers/${r.buyerId}/orders`}>{buyerName(r.buyerId)}</Link> },
    { key: 'product', title: '产品/零部件', width: 160, render: (_: any, r: Order) => nameOf(r) },
    { key: 'quantity', title: '数量', width: 90, align: 'right' },
    { key: 'totalAmount', title: '总金额', width: 120, align: 'right', render: (v: number) => fmtMoney(v) },
    { key: 'status', title: '状态', width: 100, render: (v: Order['status']) => <Tag color={STATUS_COLOR[v]}>{STATUS_TEXT[v]}</Tag> },
    { key: 'expectedDeliveryDate', title: '预计交货', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    { key: 'actualDeliveryDate', title: '实际交货', width: 120, hideOnMobile: true, render: (v: number) => fmtDate(v) },
    {
      key: 'action',
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: any, r: Order) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate(`/orders/${r.id}`)}>
            详情
          </Button>
        </Space>
      ),
    },
  ]

  async function batchComplete() {
    const keys = rowSelection.selectedRowKeys
    if (!keys.length) return message.warning('请先选择订单')
    let ok = 0
    for (const k of keys) {
      const r = await changeOrderStatus(String(k), 'completed')
      if (r.ok) ok++
      else message.error(r.reason)
    }
    message.success(`已将 ${ok} 个订单标记为已完成`)
    setRowSelection((s) => ({ ...s, selectedRowKeys: [] }))
  }

  async function handleExport() {
    exportToExcel(
      filtered.map((o) => ({
        ...o,
        supplier: supplierName(o.supplierId),
        buyer: buyerName(o.buyerId),
        product: nameOf(o),
        statusText: STATUS_TEXT[o.status],
      })),
      [
        { key: 'code', title: '订单编号' },
        { key: 'orderDate', title: '下单时间' },
        { key: 'supplier', title: '供应商' },
        { key: 'buyer', title: '购买方' },
        { key: 'product', title: '产品/零部件' },
        { key: 'quantity', title: '数量' },
        { key: 'totalAmount', title: '总金额' },
        { key: 'statusText', title: '状态' },
        { key: 'expectedDeliveryDate', title: '预计交货' },
        { key: 'actualDeliveryDate', title: '实际交货' },
      ],
      '订单列表',
    )
  }

  return (
    <div>
      <PageHeader
        title="订单"
        breadcrumb={[{ label: '订单' }]}
        extra={
          <Space wrap>
            <SearchBar value={kw} onChange={setKw} />
            <ImportExportBar onExport={handleExport} />
            {rowSelection.selectedRowKeys.length > 0 && (
              <Button icon={<CheckCircleOutlined />} onClick={batchComplete} disabled={!canEdit}>
                批量完成({rowSelection.selectedRowKeys.length})
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={() => setAddOpen(true)}>
              新增订单
            </Button>
          </Space>
        }
      />
      {scopeLabel && (
        <Alert
          type="info"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={`已按「${scopeLabel}」筛选，共 ${filtered.length} 条，合计 ${fmtMoney(
            filtered.reduce((s, o) => s + (o.totalAmount || 0), 0),
          )}`}
          action={
            <Button size="small" onClick={() => navigate('/orders')}>
              清除筛选
            </Button>
          }
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'all', label: `全部 (${((orders as Order[]) || []).length})` },
          { key: 'processing', label: `进行中 (${((orders as Order[]) || []).filter((o) => o.status === 'processing').length})` },
          { key: 'completed', label: `已完成 (${((orders as Order[]) || []).filter((o) => o.status === 'completed').length})` },
        ]}
      />
      <ResponsiveTable
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        rowSelection={canEdit ? (rowSelection as any) : undefined}
        onRowClick={(r) => navigate(`/orders/${r.id}`)}
      />

      <NewOrderModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        suppliers={suppliers as Supplier[]}
        buyers={buyers as Buyer[]}
        products={products as Product[]}
        parts={parts as Part[]}
      />
    </div>
  )
}

function NewOrderModal({
  open,
  onClose,
  suppliers,
  buyers,
  products,
  parts,
}: {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  buyers: Buyer[]
  products: Product[]
  parts: Part[]
}) {
  const [form] = Form.useForm()
  const [itemType, setItemType] = useState<'product' | 'part'>('product')
  const [selectedId, setSelectedId] = useState<string>()
  const [qty, setQty] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setItemType('product')
      setSelectedId(undefined)
      setQty(1)
      setUnitPrice(0)
    }
  }, [open])

  function onSelectItem(id?: string) {
    setSelectedId(id)
    if (itemType === 'product') {
      const p = products.find((x) => x.id === id)
      setUnitPrice(p?.unitPrice || 0)
    } else {
      const p = parts.find((x) => x.id === id)
      setUnitPrice(p?.unitPrice || 0)
    }
  }

  async function submit() {
    const values = await form.validateFields()
    if (!selectedId) return message.error('请选择产品/零部件')
    if (!values.supplierId && !values.buyerId) return message.error('请至少选择供应商或购买方')

    const payload: any = {
      supplierId: values.supplierId,
      buyerId: values.buyerId,
      quantity: qty,
      unitPrice,
      totalAmount: unitPrice * qty,
      orderDate: values.orderDate ? values.orderDate.valueOf() : Date.now(),
      expectedDeliveryDate: values.expectedDeliveryDate ? values.expectedDeliveryDate.valueOf() : undefined,
      remark: values.remark,
    }
    if (itemType === 'product') payload.productId = selectedId
    else payload.partId = selectedId

    const r = await createOrder(payload)
    if (!r.ok) {
      message.error(r.reason || '创建失败')
      return
    }
    message.success('订单已创建，库存已锁定')
    onClose()
  }

  return (
    <Modal title="新增订单" open={open} onCancel={onClose} onOk={submit} width={560} okText="提交（默认进行中）">
      <Form form={form} layout="vertical">
        <Space size="large" wrap>
          <Form.Item label="供应商（采购方）" name="supplierId">
            <Select
              allowClear
              placeholder="可选"
              style={{ width: 200 }}
              options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="购买方（销售给）" name="buyerId">
            <Select
              allowClear
              placeholder="可选"
              style={{ width: 200 }}
              options={buyers.map((b) => ({ label: b.name, value: b.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Space>

        <Form.Item label="产品 / 零部件">
          <Radio.Group
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value)
              setSelectedId(undefined)
            }}
            optionType="button"
            buttonStyle="solid"
            style={{ marginBottom: 8 }}
          >
            <Radio.Button value="product">成品</Radio.Button>
            <Radio.Button value="part">零部件</Radio.Button>
          </Radio.Group>
          <Select
            placeholder={`选择${itemType === 'product' ? '产品' : '零部件'}`}
            style={{ width: '100%' }}
            value={selectedId}
            onChange={onSelectItem}
            options={(itemType === 'product' ? products : parts).map((x) => ({
              label: `${x.name}（库存 ${x.stock - x.lockedStock}，单价 ¥${x.unitPrice}）`,
              value: x.id,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Space size="large" wrap>
          <Form.Item label="数量">
            <InputNumber min={1} value={qty} onChange={(v) => setQty(v || 1)} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="单价(¥)">
            <InputNumber min={0} value={unitPrice} onChange={(v) => setUnitPrice(v || 0)} style={{ width: 140 }} />
          </Form.Item>
          <div>
            <div style={{ color: '#999', fontSize: 12 }}>总金额（自动）</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#cf1322' }}>¥{(unitPrice * qty).toLocaleString()}</div>
          </div>
        </Space>

        <Space size="large" wrap>
          <Form.Item label="下单时间" name="orderDate" initialValue={dayjs()}>
            <DatePicker style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="预计交货时间" name="expectedDeliveryDate">
            <DatePicker style={{ width: 160 }} />
          </Form.Item>
        </Space>
        <Form.Item label="备注" name="remark">
          <Input.TextArea autoSize />
        </Form.Item>
      </Form>
    </Modal>
  )
}
