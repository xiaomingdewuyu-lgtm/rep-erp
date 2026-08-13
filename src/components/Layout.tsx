import { useState, useEffect, useMemo } from 'react'
import { Layout as AntLayout, Menu, Drawer, Button, Badge, Popover, Avatar, Tag, Tooltip, Typography } from 'antd'
import {
  MenuOutlined,
  DashboardOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  AccountBookOutlined,
  DeleteOutlined,
  SettingOutlined,
  BellOutlined,
  SyncOutlined,
  CloudSyncOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { db, availableOf } from '../db'
import { getBackendUrl } from '../syncQueue'
import { isNearDelivery, isOverdue } from '../utils/format'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth'
import { Dropdown, MenuProps } from 'antd'

const { Header, Sider, Content } = AntLayout
const { Text } = Typography

export function useResponsive() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

const MENU_ITEMS = [
  { key: '/suppliers', icon: <ShopOutlined />, label: '供应商' },
  { key: '/buyers', icon: <ShoppingCartOutlined />, label: '购买方' },
  {
    key: 'inventory',
    icon: <DatabaseOutlined />,
    label: '库存',
    children: [
      { key: '/inventory/products', label: '产品库存' },
      { key: '/inventory/parts', label: '零部件库存' },
    ],
  },
  {
    key: 'products',
    icon: <AppstoreOutlined />,
    label: '产品',
    children: [
      { key: '/products', label: '产品目录' },
      { key: '/parts', label: '零部件目录' },
    ],
  },
  { key: '/orders', icon: <FileDoneOutlined />, label: '订单' },
  { key: '/finance', icon: <AccountBookOutlined />, label: '金额' },
]

const SYS_ITEMS = [
  { key: '/recycle', icon: <DeleteOutlined />, label: '回收站' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const isMobile = useResponsive()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const userMenu: MenuProps['items'] = [
    { key: 'role', label: user?.role === 'admin' ? '管理员' : '只读用户', disabled: true },
    { type: 'divider' },
    { key: 'logout', label: '退出登录' },
  ]
  const onUserMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') logout()
  }

  const selectedKey = useMemo(() => {
    const path = location.pathname
    const all = [...MENU_ITEMS.flatMap((m) => (m.children ? m.children : [m])), ...SYS_ITEMS]
    const exact = all.find((m) => m.key === path)
    if (exact) return exact.key
    // 模糊匹配（如 /suppliers/:id/orders）
    const matched = all
      .map((m) => m.key)
      .filter((k) => k !== '/' && path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    return matched || '/'
  }, [location.pathname])

  const openKey = useMemo(() => {
    if (selectedKey.startsWith('/inventory')) return 'inventory'
    if (selectedKey.startsWith('/products') || selectedKey.startsWith('/parts')) return 'products'
    return ''
  }, [selectedKey])

  // 通知：低库存 + 临近交期
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [], [] as any[])
  const parts = useLiveQuery(() => db.parts.filter((p) => !p.deleted).toArray(), [], [] as any[])
  const orders = useLiveQuery(() => db.orders.filter((o) => !o.deleted).toArray(), [], [] as any[])

  const lowStock = useMemo(() => {
    const list: { kind: string; name: string; available: number; safety: number }[] = []
    ;(products as any[]).forEach((p) =>
      list.push({ kind: '产品', name: p.name, available: availableOf(p), safety: p.safetyStock }),
    )
    ;(parts as any[]).forEach((p) =>
      list.push({ kind: '零部件', name: p.name, available: availableOf(p), safety: p.safetyStock }),
    )
    return list.filter((i) => i.available < i.safety)
  }, [products, parts])

  const nearDelivery = useMemo(
    () =>
      (orders as any[]).filter((o) => isNearDelivery(o.expectedDeliveryDate, o.status) || isOverdue(o.expectedDeliveryDate, o.status)),
    [orders],
  )

  const notifCount = lowStock.length + nearDelivery.length

  const notifContent = (
    <div style={{ width: 280, maxHeight: 360, overflow: 'auto' }}>
      <Text strong>库存预警（{lowStock.length}）</Text>
      {lowStock.length === 0 && <div style={{ color: '#999', margin: '4px 0' }}>无</div>}
      {lowStock.map((i, idx) => (
        <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
          <Tag color="red">{i.kind}</Tag>
          {i.name} 剩余 {i.available} / 安全 {i.safety}
        </div>
      ))}
      <Text strong style={{ display: 'block', marginTop: 8 }}>
        交期提醒（{nearDelivery.length}）
      </Text>
      {nearDelivery.length === 0 && <div style={{ color: '#999', margin: '4px 0' }}>无</div>}
      {nearDelivery.map((o: any) => (
        <div key={o.id} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
          <Tag color={isOverdue(o.expectedDeliveryDate, o.status) ? 'volcano' : 'orange'}>
            {isOverdue(o.expectedDeliveryDate, o.status) ? '已逾期' : '临近'}
          </Tag>
          {o.code}
        </div>
      ))}
    </div>
  )

  const syncOn = !!getBackendUrl()

  const menuNode = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={[openKey].filter(Boolean) as string[]}
      items={[...MENU_ITEMS, { type: 'divider' as any }, ...SYS_ITEMS]}
      onClick={({ key }) => {
        navigate(key)
        setDrawerOpen(false)
      }}
      style={{ borderRight: 0 }}
    />
  )

  const header = (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: isMobile ? '0 12px' : '0 16px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {isMobile && (
        <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} style={{ marginRight: 8 }} />
      )}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
        <DashboardOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        {!isMobile && (
          <Text strong style={{ fontSize: 16 }}>
            REP 进销存
          </Text>
        )}
      </Link>
      <div style={{ flex: 1 }} />
      <Tooltip title={syncOn ? '云同步已开启' : '未开启云同步'}>
        <Tag icon={syncOn ? <CloudSyncOutlined /> : <SyncOutlined />} color={syncOn ? 'green' : 'default'}>
          {syncOn ? '已同步' : '仅本地'}
        </Tag>
      </Tooltip>
      <Popover content={notifContent} title="提醒" trigger="click" placement="bottomRight">
        <Badge count={notifCount} size="small">
          <Button type="text" icon={<BellOutlined />} />
        </Badge>
      </Popover>
      <Link to="/settings">
        <Button type="text" icon={<SettingOutlined />} />
      </Link>
      <Dropdown menu={{ items: userMenu, onClick: onUserMenu }} trigger={['click']}>
        <Button type="text" icon={<UserOutlined />} style={{ marginLeft: 4 }}>
          {user?.name || user?.username}
        </Button>
      </Dropdown>
    </Header>
  )

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={210} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }} breakpoint="lg" collapsedWidth={0}>
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 20px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <DashboardOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>
              REP 进销存
            </Text>
          </div>
          {menuNode}
        </Sider>
      )}
      {isMobile && (
        <Drawer placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={220} styles={{ body: { padding: 0 } }}>
          {menuNode}
        </Drawer>
      )}
      <AntLayout>
        {header}
        <Content style={{ padding: isMobile ? 12 : 20, background: '#f5f7fa' }}>{children}</Content>
      </AntLayout>
    </AntLayout>
  )
}
