import { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, message, Popconfirm, Space, Tag, Select, Table, Card, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, genCode, softDeleteEntity, addLog, availableOf } from '../db'
import { Product, Part, BomItem } from '../types'
import { PageHeader, SearchBar, ImportExportBar, useCanEdit } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { readExcel, exportToExcel, downloadTemplate } from '../utils/excel'
import { fmtMoney } from '../utils/format'

export default function ProductList() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [kw, setKw] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form] = Form.useForm()
  const [bom, setBom] = useState<BomItem[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])

  const list = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as Product[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as Part[])

  const partOptions = useMemo(
    () => (parts as Part[]).map((p) => ({ label: `${p.name}（${p.code}）`, value: p.id })),
    [parts],
  )

  const filtered = useMemo(
    () => (list as Product[]).filter((r) => !kw || `${r.name}${r.code}`.toLowerCase().includes(kw.toLowerCase())),
    [list, kw],
  )

  const columns: ResponsiveColumn<Product>[] = [
    { key: 'code', title: '编号', width: 130 },
    { key: 'name', title: '名称', width: 200, primary: true, render: (v: string, r: Product) => <Link to={`/products/${r.id}/orders`}>{v}</Link> },
    { key: 'unitPrice', title: '单价', width: 110, align: 'right', render: (v: number) => fmtMoney(v) },
    { key: 'stock', title: '总库存', width: 100, align: 'right' },
    { key: 'lockedStock', title: '锁定', width: 90, align: 'right', hideOnMobile: true },
    {
      key: 'available',
      title: '可用',
      width: 100,
      align: 'right',
      render: (_: any, r: Product) => {
        const a = availableOf(r)
        const danger = a < r.safetyStock
        return <span style={{ color: danger ? '#cf1322' : undefined, fontWeight: danger ? 600 : 400 }}>{a}</span>
      },
    },
    { key: 'safetyStock', title: '安全库存', width: 100, align: 'right', hideOnMobile: true },
    {
      key: 'bom',
      title: 'BOM',
      width: 120,
      hideOnMobile: true,
      render: (_: any, r: Product) => (
        <Tag color={r.bom?.length ? 'blue' : 'default'}>{r.bom?.length ? `${r.bom.length} 个零部件` : '无'}</Tag>
      ),
    },
    {
      key: 'action',
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_: any, r: Product) => (
        <Space>
          <Button size="small" icon={<RightOutlined />} onClick={() => navigate(`/products/${r.id}/orders`)} />
          <Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => openEdit(r)} />
          <Popconfirm title="确认删除该产品？关联订单的锁定库存将释放" onConfirm={() => doDelete(r)} disabled={!canEdit}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!canEdit} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  function openAdd() {
    setEditing(null)
    setBom([])
    form.resetFields()
    form.setFieldsValue({ unitPrice: 0, safetyStock: 0, stock: 0, lockedStock: 0 })
    setFormOpen(true)
  }
  function openEdit(r: Product) {
    setEditing(r)
    setBom(r.bom || [])
    form.setFieldsValue(r)
    setFormOpen(true)
  }
  async function submit() {
    const values = await form.validateFields()
    const payload: any = {
      name: values.name,
      description: values.description,
      unitPrice: values.unitPrice || 0,
      safetyStock: values.safetyStock || 0,
      stock: values.stock || 0,
      lockedStock: values.lockedStock || 0,
      bom,
      updatedAt: Date.now(),
    }
    if (editing) {
      await db.products.update(editing.id, payload)
      await addLog('product', editing.id, 'update', `更新产品 ${values.name}`, editing.code)
      message.success('已保存')
    } else {
      const code = await genCode('product')
      await db.products.add({ id: crypto.randomUUID(), code, createdAt: Date.now(), ...payload })
      await addLog('product', '', 'create', `新建产品 ${values.name}`, code)
      message.success('已新增')
    }
    setFormOpen(false)
  }
  async function doDelete(r: Product) {
    await softDeleteEntity('product', r.id)
    message.success('已删除')
  }

  async function handleImport(file: File) {
    const rows = await readExcel(file)
    const errors: string[] = []
    let added = 0
    for (let i = 0; i < rows.length; i++) {
      const row: any = rows[i]
      const name = String(row['名称'] ?? '').trim()
      if (!name) {
        errors.push(`第 ${i + 2} 行：名称为空`)
        continue
      }
      const codeRaw = String(row['编号'] ?? '').trim()
      const existing = (list as Product[]).find((e) => e.code === codeRaw)
      const payload: any = {
        name,
        description: String(row['描述'] ?? ''),
        unitPrice: Number(row['单价'] ?? 0) || 0,
        safetyStock: Number(row['安全库存'] ?? 0) || 0,
        stock: Number(row['总库存'] ?? 0) || 0,
        lockedStock: Number(row['锁定量'] ?? 0) || 0,
        bom: existing?.bom || [],
        updatedAt: Date.now(),
      }
      if (existing) await db.products.update(existing.id, payload)
      else {
        const code = codeRaw || (await genCode('product'))
        await db.products.add({ id: crypto.randomUUID(), code, createdAt: Date.now(), ...payload })
        added++
      }
    }
    setImportErrors(errors)
    message.success(`导入完成，新增/更新 ${rows.length - errors.length} 条${errors.length ? `，跳过 ${errors.length} 行` : ''}`)
  }

  function handleExport() {
    exportToExcel(
      filtered,
      [
        { key: 'code', title: '编号' },
        { key: 'name', title: '名称' },
        { key: 'description', title: '描述' },
        { key: 'unitPrice', title: '单价' },
        { key: 'safetyStock', title: '安全库存' },
        { key: 'stock', title: '总库存' },
        { key: 'lockedStock', title: '锁定量' },
      ],
      '产品目录',
    )
  }
  function handleTemplate() {
    downloadTemplate(
      [
        { title: '名称', sample: '执手锁A型' },
        { title: '描述', sample: '' },
        { title: '单价', sample: '120' },
        { title: '安全库存', sample: '10' },
        { title: '总库存', sample: '100' },
        { title: '锁定量', sample: '0' },
      ],
      '产品导入模板',
    )
  }

  return (
    <div>
      <PageHeader
        title="产品目录"
        breadcrumb={[{ label: '产品', to: '/products' }, { label: '产品目录' }]}
        extra={
          <Space wrap>
            <SearchBar value={kw} onChange={setKw} />
            <ImportExportBar onImport={canEdit ? handleImport : undefined} onExport={handleExport} onTemplate={handleTemplate} />
            <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={openAdd}>
              新增产品
            </Button>
          </Space>
        }
      />
      <ResponsiveTable rowKey="id" columns={columns} dataSource={filtered} onRowClick={(r) => navigate(`/products/${r.id}/orders`)} />

      <Modal title={editing ? '编辑产品' : '新增产品'} open={formOpen} onCancel={() => setFormOpen(false)} width={560} footer={null}>
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea autoSize />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item label="单价(¥)" name="unitPrice" initialValue={0}>
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="安全库存" name="safetyStock" initialValue={0}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="总库存" name="stock" initialValue={0}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="锁定量" name="lockedStock" initialValue={0}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Card size="small" title="BOM 物料清单（该产品由哪些零部件组成）" style={{ marginBottom: 12 }}>
            <Table
              size="small"
              pagination={false}
              dataSource={bom}
              rowKey={(r, i) => String(i)}
              columns={[
                {
                  title: '零部件',
                  dataIndex: 'partId',
                  render: (v, _r, idx) => (
                    <Select
                      style={{ width: '100%' }}
                      placeholder="选择零部件"
                      options={partOptions}
                      value={v || undefined}
                      onChange={(val) => setBom((b) => b.map((x, i) => (i === idx ? { ...x, partId: val } : x)))}
                    />
                  ),
                },
                {
                  title: '数量/件',
                  dataIndex: 'quantity',
                  width: 130,
                  render: (v, _r, idx) => (
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      value={v}
                      onChange={(val) => setBom((b) => b.map((x, i) => (i === idx ? { ...x, quantity: val || 0 } : x)))}
                    />
                  ),
                },
                {
                  title: '操作',
                  width: 70,
                  render: (_v, _r, idx) => (
                    <Button size="small" danger onClick={() => setBom((b) => b.filter((_, i) => i !== idx))}>
                      删
                    </Button>
                  ),
                },
              ]}
              locale={{ emptyText: '暂无 BOM，点击下方添加' }}
            />
            <Button
              type="dashed"
              block
              style={{ marginTop: 8 }}
              onClick={() => setBom((b) => [...b, { partId: '', quantity: 1 }])}
              disabled={!canEdit}
            >
              + 添加零部件
            </Button>
          </Card>

          <Button type="primary" block onClick={submit} disabled={!canEdit}>
            保存
          </Button>
        </Form>
      </Modal>

      <Modal title="导入错误明细" open={importErrors.length > 0} onCancel={() => setImportErrors([])} onOk={() => setImportErrors([])}>
        <ul style={{ maxHeight: 300, overflow: 'auto' }}>{importErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </Modal>
    </div>
  )
}
