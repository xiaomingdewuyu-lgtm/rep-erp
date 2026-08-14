import { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Space,
  Table,
  Tag,
  message,
  App,
  Alert,
  Divider,
  Typography,
  Modal,
  Popconfirm,
} from 'antd'
import { CloudSyncOutlined, DownloadOutlined, UploadOutlined, UserAddOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  loadSettings,
  saveSettings,
  exportSnapshot,
  importSnapshot,
  db,
  listUsers,
  addUser,
  updateUserPassword,
  updateUserRole,
  deleteUser,
} from '../db'
import { manualSync, serverListUsers, serverAddUser, serverSetPassword, serverSetRole, serverDeleteUser } from '../sync'
import { getBackendUrl, loadBackendFromSettings } from '../syncQueue'
import { User } from '../types'
import { PageHeader } from '../components/common'
import { exportJSON, exportWorkbook } from '../utils/excel'
import { fmtDateTime } from '../utils/format'
import { useResponsive } from '../components/Layout'

const { Paragraph, Text } = Typography

export default function SettingsPage() {
  const { message } = App.useApp()
  const isMobile = useResponsive()
  const [syncForm] = Form.useForm()
  const [syncing, setSyncing] = useState(false)
  const [addForm] = Form.useForm()
  const [pwdForm] = Form.useForm()

  loadBackendFromSettings()
  const settings = loadSettings()
  const [backendUrl, setBackendUrl] = useState(settings.sync?.backendUrl || '')
  const [serverUsers, setServerUsers] = useState<User[]>([])

  // 是否云端/多人模式：以「运行时真实后端」为准（含同源自动云端），而非仅看已保存的显式地址
  // 云端版 saved backendUrl 为空，但同源会自动指向 origin，必须按运行时判定
  const [usingServer, setUsingServer] = useState(() => !!getBackendUrl())
  const localUsers = useLiveQuery(() => listUsers(), [], [] as User[])

  const [addOpen, setAddOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdTarget, setPwdTarget] = useState<User | null>(null)

  useEffect(() => {
    if (usingServer) {
      serverListUsers()
        .then((us) => setServerUsers(us))
        .catch(() => setServerUsers([]))
    }
  }, [usingServer, pwdOpen, addOpen])

  const users = usingServer ? serverUsers : (localUsers as User[])

  async function doSync() {
    setSyncing(true)
    try {
      const r = await manualSync()
      message.success(`同步完成：已推送 ${r.pushed} 条，拉取 ${r.pulled} 条`)
    } catch (e: any) {
      message.error('同步失败：' + (e?.message || '网络错误'))
    }
    setSyncing(false)
  }

  async function exportAll() {
    const snap = await exportSnapshot()
    exportJSON(snap, 'REP全量备份')
    message.success('已导出全量 JSON 备份')
  }

  async function exportAllExcel() {
    const snap = await exportSnapshot()
    exportWorkbook(
      [
        { name: '供应商', rows: snap.suppliers },
        { name: '购买方', rows: snap.buyers },
        { name: '产品', rows: snap.products },
        { name: '零部件', rows: snap.parts },
        { name: '订单', rows: snap.orders },
      ],
      'REP全量数据',
    )
  }

  async function importAll(file: File) {
    try {
      const text = await file.text()
      const snap = JSON.parse(text)
      if (!snap.version || !Array.isArray(snap.orders)) throw new Error('文件格式不正确')
      await importSnapshot(snap, true)
      message.success('已合并导入备份数据')
    } catch (e: any) {
      message.error('导入失败：' + e.message)
    }
  }

  // ---- 账号管理 ----
  async function submitAdd() {
    const v = await addForm.validateFields()
    try {
      if (usingServer) {
        await serverAddUser({ username: v.username.trim(), name: v.name?.trim(), password: v.password, role: v.role })
      } else {
        await addUser({ username: v.username.trim(), name: v.name?.trim(), password: v.password, role: v.role })
      }
      message.success('账号已创建')
      setAddOpen(false)
      addForm.resetFields()
      if (usingServer) setServerUsers(await serverListUsers().catch(() => []))
    } catch (e: any) {
      message.error(e.message || '创建失败')
    }
  }

  async function submitPwd() {
    const v = await pwdForm.validateFields()
    if (!pwdTarget) return
    try {
      if (usingServer) await serverSetPassword(pwdTarget.id, v.password)
      else await updateUserPassword(pwdTarget.id, v.password)
      message.success('密码已修改')
      setPwdOpen(false)
      pwdForm.resetFields()
    } catch (e: any) {
      message.error(e.message || '修改失败')
    }
  }

  async function changeRole(r: User, role: 'admin' | 'viewer') {
    try {
      if (usingServer) await serverSetRole(r.id, role)
      else await updateUserRole(r.id, role)
      message.success('已更新角色')
      if (usingServer) setServerUsers(await serverListUsers().catch(() => []))
    } catch (e: any) {
      message.error(e.message || '操作失败')
    }
  }

  async function remove(r: User) {
    try {
      if (usingServer) await serverDeleteUser(r.id)
      else await deleteUser(r.id)
      message.success('已删除账号')
      if (usingServer) setServerUsers(await serverListUsers().catch(() => []))
    } catch (e: any) {
      message.error(e.message || '删除失败')
    }
  }

  return (
    <div>
      <PageHeader title="设置" breadcrumb={[{ label: '设置' }]} />

      <Card title="账号管理" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            usingServer
              ? '当前为多人共享模式：账号由服务端统一管理，所有登录用户共用同一套业务数据。'
              : '基础权限：管理员可增删改所有数据；只读用户仅可查看。当前为本地模式，账号仅存于本机浏览器。'
          }
        />
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
            新增账号
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={users as User[]}
          columns={[
            { title: '用户名', dataIndex: 'username', width: 130 },
            { title: '姓名', dataIndex: 'name', render: (v: string) => v || '-' },
            {
              title: '角色',
              dataIndex: 'role',
              width: 110,
              render: (r: string) => <Tag color={r === 'admin' ? 'blue' : 'default'}>{r === 'admin' ? '管理员' : '只读'}</Tag>,
            },
            {
              title: '操作',
              render: (_, r: User) => (
                <Space>
                  <Button size="small" onClick={() => { setPwdTarget(r); setPwdOpen(true) }}>
                    改密码
                  </Button>
                  <Select
                    size="small"
                    value={r.role}
                    style={{ width: 90 }}
                    onChange={(v) => changeRole(r, v)}
                    options={[
                      { label: '管理员', value: 'admin' },
                      { label: '只读', value: 'viewer' },
                    ]}
                  />
                  <Popconfirm title="确认删除该账号？" onConfirm={() => remove(r)}>
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card title={<span><CloudSyncOutlined /> 多人共享后端（中央数据库）</span>} style={{ borderRadius: 10, marginBottom: 16 }}>
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="配置后端服务地址后，所有人登录看到的将是同一份数据（真正的多人共用）。后端部署在境外免费 Node 平台，无需 ICP 备案。"
        />
        <Form layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item label="后端服务地址" extra="部署后端后得到的地址（如 https://xxx.render.com）。留空表示与前端同源（后端同时托管前端）。配置后登录将走服务端校验。">
            <Input
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://your-backend-host （留空=同源）"
            />
          </Form.Item>
          <Space wrap>
            <Button
              onClick={() => {
                const s = loadSettings()
                s.sync = { ...s.sync, backendUrl: backendUrl.trim() }
                saveSettings(s)
                loadBackendFromSettings()
                setUsingServer(!!getBackendUrl())
                message.success('已保存后端地址（重启登录后生效）')
              }}
            >
              保存地址
            </Button>
            <Button type="primary" loading={syncing} disabled={!backendUrl} onClick={doSync}>
              立即同步
            </Button>
          </Space>
        </Form>
        <Divider />
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          <Text strong>多端使用建议：</Text>
          <br />1. 部署后端后，打开系统 → 右上角齿轮填入后端地址并保存；
          <br />2. 用管理员账号登录（默认 wanghuizhen / wanghuizhen123 等）；
          <br />3. 任意一端新增/修改数据，其他端每隔约 15 秒自动同步，也可点「立即同步」手动刷新。
        </Paragraph>
      </Card>

      <Card title="数据备份与恢复" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={exportAll}>
            导出全量 JSON 备份
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportAllExcel}>
            导出全量 Excel
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              const el = document.createElement('input')
              el.type = 'file'
              el.accept = '.json'
              el.onchange = () => el.files?.[0] && importAll(el.files[0])
              el.click()
            }}
          >
            导入 JSON 备份（合并）
          </Button>
        </Space>
        <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 12 }}>
          JSON 备份是最可靠的迁移/灾备方式，建议定期导出留存。
        </Paragraph>
      </Card>

      <Card title="操作日志（后台可见）" style={{ borderRadius: 10 }}>
        <UserLogs />
      </Card>

      {/* 新增账号弹窗 */}
      <Modal title="新增账号" open={addOpen} onOk={submitAdd} onCancel={() => setAddOpen(false)} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={addForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="登录账号" />
          </Form.Item>
          <Form.Item name="name" label="姓名（可选）">
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="admin">
            <Select
              options={[
                { label: '管理员（可编辑）', value: 'admin' },
                { label: '只读用户（仅查看）', value: 'viewer' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title={`修改密码 - ${pwdTarget?.name || pwdTarget?.username || ''}`}
        open={pwdOpen}
        onOk={submitPwd}
        onCancel={() => setPwdOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
            <Input.Password placeholder="新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function UserLogs() {
  const logs = useLiveQuery(
    () => db.logs.orderBy('time').reverse().limit(200).toArray(),
    [],
    [] as any[],
  )
  return (
    <Table
      size="small"
      rowKey="id"
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 10 }}
      dataSource={logs as any[]}
      columns={[
        { title: '时间', dataIndex: 'time', width: 160, render: (v: number) => fmtDateTime(v) },
        { title: '类型', dataIndex: 'entityType', width: 100, render: (v: string) => <Tag>{v}</Tag> },
        { title: '动作', dataIndex: 'action', width: 90 },
        { title: '内容', dataIndex: 'content' },
        { title: '操作人', dataIndex: 'operator', width: 100 },
      ]}
    />
  )
}
