import { ReactNode } from 'react'
import { Input, Button, Space, Breadcrumb, Typography, Tag, Card } from 'antd'
import { DownloadOutlined, UploadOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons'
import { loadSettings } from '../db'
import { useResponsive } from './Layout'
import { useAuth } from '../auth'

const { Title } = Typography

export function PageHeader({
  title,
  extra,
  breadcrumb,
}: {
  title: string
  extra?: ReactNode
  breadcrumb?: { label: string; to?: string }[]
}) {
  const isMobile = useResponsive()
  return (
    <div style={{ marginBottom: 16 }}>
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={breadcrumb.map((b) => ({ title: b.to ? <a href={b.to}>{b.label}</a> : b.label }))}
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 8,
        }}
      >
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          {title}
        </Title>
        <Space wrap>{extra}</Space>
      </div>
    </div>
  )
}

export function SearchBar({ value, onChange, placeholder = '搜索名称 / 编号' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      allowClear
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 260, maxWidth: '100%' }}
    />
  )
}

export function ImportExportBar({
  onImport,
  onExport,
  onTemplate,
  importText = '导入 Excel',
  exportText = '导出当前列表',
}: {
  onImport?: (file: File) => void
  onExport: () => void
  onTemplate?: () => void
  importText?: string
  exportText?: string
}) {
  const isMobile = useResponsive()
  return (
    <Space wrap>
      {onTemplate && (
        <Button icon={<FileExcelOutlined />} onClick={onTemplate}>
          {isMobile ? '模板' : '下载模板'}
        </Button>
      )}
      {onImport && (
        <Button
          icon={<UploadOutlined />}
          onClick={() => {
            const el = document.createElement('input')
            el.type = 'file'
            el.accept = '.xlsx,.xls'
            el.onchange = () => {
              const f = el.files?.[0]
              if (f) onImport(f)
            }
            el.click()
          }}
        >
          {importText}
        </Button>
      )}
      <Button icon={<DownloadOutlined />} onClick={onExport}>
        {exportText}
      </Button>
    </Space>
  )
}

export function useCanEdit(): boolean {
  const { user } = useAuth()
  return !!user && user.role === 'admin'
}

export function RoleTag() {
  const { user } = useAuth()
  const isAdmin = !!user && user.role === 'admin'
  return <Tag color={isAdmin ? 'blue' : 'default'}>{isAdmin ? '管理员' : '只读用户'}</Tag>
}

export function SectionCard({ title, extra, children }: { title?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card size="small" title={title} extra={extra} style={{ borderRadius: 10, marginBottom: 16 }}>
      {children}
    </Card>
  )
}
