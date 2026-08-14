import { useState, useEffect } from 'react'
import { Form, Input, Button, Card, Typography, App, Modal, Tooltip } from 'antd'
import { UserOutlined, LockOutlined, DashboardOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings } from '../db'
import { setBackendUrl, loadBackendFromSettings, getBackendUrl } from '../syncQueue'

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

  const [syncOn, setSyncOn] = useState(!!getBackendUrl())
  useEffect(() => {
    loadBackendFromSettings()
    setSyncOn(!!getBackendUrl())
  }, [])

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
        <Tooltip title="高级设置：可指定自定义后端地址（一般无需修改）">
          <Button
            type="text"
            icon={<SettingOutlined />}
            style={{ position: 'absolute', top: 12, right: 12 }}
            onClick={() => {
              cfgForm.setFieldsValue({ backendUrl: (loadSettings().sync?.backendUrl) || '' })
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
        {syncOn ? (
          <Text type="success" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
            已连接云端服务
          </Text>
        ) : (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
            本地模式：数据仅保存在本设备
          </Text>
        )}
      </Card>

      <Modal title="高级设置（自定义后端地址）" open={cfgOpen} onOk={saveCfg} onCancel={() => setCfgOpen(false)} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={cfgForm} layout="vertical">
          <Form.Item
            name="backendUrl"
            label="后端地址"
            extra="一般无需修改。留空表示使用当前网址作为服务端（即当前云端版本，数据自动同步）；如自行部署了独立后端，可在此填入其地址。"
          >
            <Input placeholder="https://your-host （留空=同源/云端）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
