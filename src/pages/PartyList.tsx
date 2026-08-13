import { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, message, Popconfirm, Tag, Space, Drawer } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, genCode, softDeleteEntity, addLog } from '../db'
import { Supplier, Buyer } from '../types'
import { PageHeader, SearchBar, ImportExportBar, useCanEdit } from '../components/common'
import ResponsiveTable, { ResponsiveColumn } from '../components/ResponsiveTable'
import { readExcel, exportToExcel, downloadTemplate, num } from '../utils/excel'
import { fmtDate, fmtDateTime } from '../utils/format'

type Party = Supplier | Buyer

const FIELDS = [
  { key: 'name', title: '名称', required: true },
  { key: 'contact', title: '联系人' },
  { key: 'phone', title: '电话' },
  { key: 'email', title: '邮箱' },
  { key: 'address', title: '地址' },
]

const EXCEL_COLS = [
  { key: 'code', title: '编号' },
  { key: 'name', title: '名称' },
  { key: 'contact', title: '联系人' },
  { key: 'phone', title: '电话' },
  { key: 'email', title: '邮箱' },
  { key: 'address', title: '地址' },
]

export default function PartyList({ kind }: { kind: 'supplier' | 'buyer' }) {
  const isSupplier = kind === 'supplier'
  const title = isSupplier ? '供应商' : '购买方'
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const [kw, setKw] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [form] = Form.useForm()
  const [importErrors, setImportErrors] = useState<string[]>([])

  const list = useLiveQuery(
    () => (isSupplier ? db.suppliers : db.buyers).filter((x: Party) => !x.deleted).toArray(),
    [kind],
    [] as Party[],
  )

  const filtered = useMemo(
    () => (list as Party[]).filter((r) => !kw || `${r.name}${r.code}${r.contact}${r.phone}`.toLowerCase().includes(kw.toLowerCase())),
    [list, kw],
  )

  const columns: ResponsiveColumn<Party>[] = [
    { key: 'code', title: '编号', width: 130, primary: false, sorter: (a: Party, b: Party) => a.code.localeCompare(b.code) },
    {
      key: 'name',
      title: '名称',
      width: 200,
      primary: true,
      render: (v: string, r: Party) => <Link to={`/${kind}s/${r.id}/orders`}>{v}</Link>,
    },
    { key: 'contact', title: '联系人', width: 120, hideOnMobile: true },
    { key: 'phone', title: '电话', width: 140, hideOnMobile: true },
    { key: 'email', title: '邮箱', width: 180, hideOnMobile: true },
    { key: 'address', title: '地址', width: 220, hideOnMobile: true },
    { key: 'createdAt', title: '创建时间', width: 160, hideOnMobile: true, render: (v: number) => fmtDateTime(v) },
    {
      key: 'action',
      title: '操作',
      width: 130,
      fixed: 'right',
      render: (_: any, r: Party) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => openEdit(r)} />
          <Popconfirm title={`确认删除该${title}？`} onConfirm={() => doDelete(r)} disabled={!canEdit}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!canEdit} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  function openAdd() {
    setEditing(null)
    form.resetFields()
    setFormOpen(true)
  }
  function openEdit(r: Party) {
    setEditing(r)
    form.setFieldsValue(r)
    setFormOpen(true)
  }
  async function submit() {
    const values = await form.validateFields()
    if (editing) {
      await (isSupplier ? db.suppliers : db.buyers).update(editing.id, { ...values, updatedAt: Date.now() })
      await addLog(kind, editing.id, 'update', `更新 ${values.name}`, editing.code)
      message.success('已保存')
    } else {
      const code = await genCode(kind)
      const now = Date.now()
      await (isSupplier ? db.suppliers : db.buyers).add({
        id: crypto.randomUUID(),
        code,
        ...values,
        createdAt: now,
        updatedAt: now,
      } as Party)
      await addLog(kind, '', 'create', `新建 ${values.name}`, code)
      message.success('已新增')
    }
    setFormOpen(false)
  }
  async function doDelete(r: Party) {
    await softDeleteEntity(kind, r.id)
    message.success('已删除（可在回收站恢复）')
  }

  // Excel 导入
  async function handleImport(file: File) {
    const rows = await readExcel(file)
    const errors: string[] = []
    let added = 0
    const existing = (list as Party[])
    for (let i = 0; i < rows.length; i++) {
      const row: any = rows[i]
      const name = String(row['名称'] ?? row['name'] ?? '').trim()
      if (!name) {
        errors.push(`第 ${i + 2} 行：名称为空，已跳过`)
        continue
      }
      const codeRaw = String(row['编号'] ?? row['code'] ?? '').trim()
      const dup = existing.find((e) => e.code === codeRaw)
      const payload: any = {
        name,
        contact: String(row['联系人'] ?? row['contact'] ?? ''),
        phone: String(row['电话'] ?? row['phone'] ?? ''),
        email: String(row['邮箱'] ?? row['email'] ?? ''),
        address: String(row['地址'] ?? row['address'] ?? ''),
        updatedAt: Date.now(),
      }
      if (dup) {
        await (isSupplier ? db.suppliers : db.buyers).update(dup.id, payload)
      } else {
        const code = codeRaw || (await genCode(kind))
        await (isSupplier ? db.suppliers : db.buyers).add({
          id: crypto.randomUUID(),
          code,
          ...payload,
          createdAt: Date.now(),
        } as Party)
        added++
      }
    }
    setImportErrors(errors)
    if (errors.length) message.warning(`导入完成，跳过 ${errors.length} 行（详见弹窗）`)
    else message.success(`导入成功，新增/更新 ${rows.length} 条`)
  }

  function handleExport() {
    exportToExcel(filtered, EXCEL_COLS, isSupplier ? '供应商列表' : '购买方列表')
  }
  function handleTemplate() {
    downloadTemplate(
      FIELDS.map((f) => ({ title: f.title, sample: f.title === '名称' ? '示例公司' : '' })),
      isSupplier ? '供应商导入模板' : '购买方导入模板',
    )
  }

  return (
    <div>
      <PageHeader
        title={title}
        extra={
          <Space wrap>
            <SearchBar value={kw} onChange={setKw} />
            <ImportExportBar onImport={canEdit ? handleImport : undefined} onExport={handleExport} onTemplate={handleTemplate} />
            <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={openAdd}>
              新增{title}
            </Button>
          </Space>
        }
      />
      <ResponsiveTable
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={false}
        onRowClick={(r) => navigate(`/${kind}s/${r.id}/orders`)}
      />

      <Drawer title={editing ? `编辑${title}` : `新增${title}`} open={formOpen} onClose={() => setFormOpen(false)} width={420}>
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：XX锁业" />
          </Form.Item>
          <Form.Item label="联系人" name="contact">
            <Input />
          </Form.Item>
          <Form.Item label="电话" name="phone">
            <Input />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input />
          </Form.Item>
          <Form.Item label="地址" name="address">
            <Input.TextArea autoSize />
          </Form.Item>
          <Button type="primary" block onClick={submit}>
            保存
          </Button>
        </Form>
      </Drawer>

      <Modal title="导入错误明细" open={importErrors.length > 0} onCancel={() => setImportErrors([])} onOk={() => setImportErrors([])}>
        <ul style={{ maxHeight: 300, overflow: 'auto', paddingLeft: 18 }}>
          {importErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
