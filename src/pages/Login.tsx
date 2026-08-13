import { useState } from 'react'
import { Form, Input, Button, Card, Typography, App, Modal, Tooltip } from 'antd'
import { UserOutlined, LockOutlined, DashboardOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings } from '../db'
import { setBackendUrl } from '../syncQueue'

const { Title, Text } = Typography

export default function Login() {
  const { login } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgForm] = Form.useForm()

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true)
    const r = await login(v.username, v.password)
    setLoading(false)
    if (r.ok) {
      message.success('登录成功')
      navigate('/')
    } else {
      message.error(r.reason || '登录失败')
    }
  }

  function saveCfg() {
    cfgForm.validateFields().then((v) => {
      const s = loadSettings()
      s.sync = { ...s.sync, backendUrl: (v.backendUrl || '').trim() }
      saveSettings(s)
      setBackendUrl(s.sync.backendUrl)
      setCfgOpen(false)
      message.success('已保存后端地址')
    })
  }

  const cur = loadSettings()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e6f0ff 0%, #f5f7fa 100%)',
        padding: 16,
      }}
    >
      <Card style={{ width: 380, maxWidth: '100%', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', position: 'relative' }}>
        <Tooltip title="配置后端服务地址（多人共享数据）">
          <Button
            type="text"
            icon={<SettingOutlined />}
            style={{ position: 'absolute', top: 12, right: 12 }}
            onClick={() => {
              cfgForm.setFieldsValue({ backendUrl: cur.sync.backendUrl || '' })
              setCfgOpen(true)
            }}
          />
        </Tooltip>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <DashboardOutlined style={{ fontSize: 36, color: '#1677ff' }} />
          <Title level={3} style={{ margin: '12px 0 0' }}>
            REP 进销存
          </Title>
          <Text type="secondary">请登录后进入系统</Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登 录
          </Button>
        </Form>
        {cur.sync.backendUrl ? (
          <Text type="success" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
            已连接共享后端
          </Text>
        ) : (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
            未配置后端：点击右上角齿轮可启用多人共享
          </Text>
        )}
      </Card>

      <Modal title="配置后端服务地址" open={cfgOpen} onOk={saveCfg} onCancel={() => setCfgOpen(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={cfgForm} layout="vertical">
          <Form.Item
            name="backendUrl"
            label="后端地址"
            extra="多人共享时填写后端服务地址（例如 https://your-host 或留空表示与前端同源）。配置后登录将走服务端校验。"
          >
            <Input placeholder="https://your-host （留空=同源）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
