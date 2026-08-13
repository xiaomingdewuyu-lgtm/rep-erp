import { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, message, Popconfirm, Space, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, genCode, softDeleteEntity, addLog, availableOf } from '../db'
import { Part } from '../types'
import { PageHeader, SearchBar, ImportExportBar, useCanEdit } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { readExcel, exportToExcel, downloadTemplate } from '../utils/excel'
import { fmtMoney } from '../utils/format'

export default function PartList() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [kw, setKw] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Part | null>(null)
  const [form] = Form.useForm()
  const [importErrors, setImportErrors] = useState<string[]>([])

  const list = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as Part[])
  const filtered = useMemo(
    () => (list as Part[]).filter((r) => !kw || `${r.name}${r.code}`.toLowerCase().includes(kw.toLowerCase())),
    [list, kw],
  )

  const columns: ResponsiveColumn<Part>[] = [
    { key: 'code', title: '编号', width: 130 },
    { key: 'name', title: '名称', width: 200, primary: true },
    { key: 'unitPrice', title: '单价', width: 110, align: 'right', render: (v: number) => fmtMoney(v) },
    { key: 'stock', title: '总库存', width: 100, align: 'right' },
    { key: 'lockedStock', title: '锁定', width: 90, align: 'right', hideOnMobile: true },
    {
      key: 'available',
      title: '可用',
      width: 100,
      align: 'right',
      render: (_: any, r: Part) => {
        const a = availableOf(r)
        const danger = a < r.safetyStock
        return <span style={{ color: danger ? '#cf1322' : undefined, fontWeight: danger ? 600 : 400 }}>{a}</span>
      },
    },
    { key: 'safetyStock', title: '安全库存', width: 100, align: 'right', hideOnMobile: true },
    {
      key: 'action',
      title: '操作',
      width: 130,
      fixed: 'right',
      render: (_: any, r: Part) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => openEdit(r)} />
          <Popconfirm title="确认删除该零部件？" onConfirm={() => doDelete(r)} disabled={!canEdit}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!canEdit} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  function openAdd() {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ unitPrice: 0, safetyStock: 0, stock: 0, lockedStock: 0 })
    setFormOpen(true)
  }
  function openEdit(r: Part) {
    setEditing(r)
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
      updatedAt: Date.now(),
    }
    if (editing) {
      await db.parts.update(editing.id, payload)
      await addLog('part', editing.id, 'update', `更新零部件 ${values.name}`, editing.code)
      message.success('已保存')
    } else {
      const code = await genCode('part')
      await db.parts.add({ id: crypto.randomUUID(), code, createdAt: Date.now(), ...payload })
      await addLog('part', '', 'create', `新建零部件 ${values.name}`, code)
      message.success('已新增')
    }
    setFormOpen(false)
  }
  async function doDelete(r: Part) {
    await softDeleteEntity('part', r.id)
    message.success('已删除')
  }

  async function handleImport(file: File) {
    const rows = await readExcel(file)
    const errors: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const row: any = rows[i]
      const name = String(row['名称'] ?? '').trim()
      if (!name) {
        errors.push(`第 ${i + 2} 行：名称为空`)
        continue
      }
      const codeRaw = String(row['编号'] ?? '').trim()
      const existing = (list as Part[]).find((e) => e.code === codeRaw)
      const payload: any = {
        name,
        description: String(row['描述'] ?? ''),
        unitPrice: Number(row['单价'] ?? 0) || 0,
        safetyStock: Number(row['安全库存'] ?? 0) || 0,
        stock: Number(row['总库存'] ?? 0) || 0,
        lockedStock: Number(row['锁定量'] ?? 0) || 0,
        updatedAt: Date.now(),
      }
      if (existing) await db.parts.update(existing.id, payload)
      else {
        const code = codeRaw || (await genCode('part'))
        await db.parts.add({ id: crypto.randomUUID(), code, createdAt: Date.now(), ...payload })
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
      '零部件目录',
    )
  }
  function handleTemplate() {
    downloadTemplate(
      [
        { title: '名称', sample: '锁芯' },
        { title: '描述', sample: '' },
        { title: '单价', sample: '5' },
        { title: '安全库存', sample: '50' },
        { title: '总库存', sample: '500' },
        { title: '锁定量', sample: '0' },
      ],
      '零部件导入模板',
    )
  }

  return (
    <div>
      <PageHeader
        title="零部件目录"
        breadcrumb={[{ label: '产品', to: '/products' }, { label: '零部件目录' }]}
        extra={
          <Space wrap>
            <SearchBar value={kw} onChange={setKw} />
            <ImportExportBar onImport={canEdit ? handleImport : undefined} onExport={handleExport} onTemplate={handleTemplate} />
            <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={openAdd}>
              新增零部件
            </Button>
          </Space>
        }
      />
      <ResponsiveTable rowKey="id" columns={columns} dataSource={filtered} />

      <Modal title={editing ? '编辑零部件' : '新增零部件'} open={formOpen} onCancel={() => setFormOpen(false)} width={480} footer={null}>
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：锁芯 / 锁体 / 面板" />
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
