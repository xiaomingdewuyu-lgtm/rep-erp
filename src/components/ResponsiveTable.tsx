import { ReactNode } from 'react'
import { Card, Table, Empty, Space, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useResponsive } from './Layout'

const { Text } = Typography

export interface ResponsiveColumn<T> {
  key: string
  title: string
  dataIndex?: string
  width?: number
  render?: (value: any, record: T, index: number) => ReactNode
  /** 手机端是否作为卡片标题 */
  primary?: boolean
  /** 手机端隐藏 */
  hideOnMobile?: boolean
  sorter?: any
  fixed?: 'left' | 'right'
  align?: 'left' | 'right' | 'center'
}

interface Props<T> {
  columns: ResponsiveColumn<T>[]
  dataSource: T[]
  rowKey: string
  loading?: boolean
  rowSelection?: TableProps<T>['rowSelection']
  pagination?: any
  emptyText?: string
  onRowClick?: (record: T) => void
}

/**
 * 响应式数据表：
 * - 桌面端：标准 AntD 表格（横向滚动 + 分页）
 * - 手机端：卡片列表，主字段做标题，其余字段两列排布
 */
export default function ResponsiveTable<T extends Record<string, any>>({
  columns,
  dataSource,
  rowKey,
  loading,
  rowSelection,
  pagination,
  emptyText = '暂无数据',
  onRowClick,
}: Props<T>) {
  const isMobile = useResponsive()

  if (!isMobile) {
    return (
      <Table<T>
        rowKey={rowKey}
        loading={loading}
        columns={columns.map((c) => ({
          key: c.key,
          title: c.title,
          dataIndex: c.dataIndex ?? c.key,
          width: c.width,
          render: c.render,
          sorter: c.sorter,
          fixed: c.fixed,
          align: c.align,
        })) as any}
        dataSource={dataSource}
        rowSelection={rowSelection}
        scroll={{ x: 'max-content' }}
        size="middle"
        pagination={
          pagination === false
            ? false
            : {
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                defaultPageSize: 10,
                showTotal: (t) => `共 ${t} 条`,
                ...pagination,
              }
        }
        locale={{ emptyText: <Empty description={emptyText} /> }}
        onRow={(record) => ({
          onClick: () => onRowClick?.(record),
          style: onRowClick ? { cursor: 'pointer' } : undefined,
        })}
      />
    )
  }

  // 手机端卡片视图
  if (!dataSource.length) {
    return <Empty description={emptyText} style={{ padding: '40px 0' }} />
  }

  const primaryCol = columns.find((c) => c.primary) || columns[0]
  const bodyCols = columns.filter((c) => c !== primaryCol && !c.hideOnMobile && c.key !== 'action')
  const actionCol = columns.find((c) => c.key === 'action')

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {dataSource.map((record, index) => (
        <Card
          key={record[rowKey]}
          size="small"
          styles={{ body: { padding: 12 } }}
          style={{ borderRadius: 10 }}
          onClick={() => onRowClick?.(record)}
        >
          <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
            {primaryCol.render
              ? primaryCol.render(record[primaryCol.dataIndex ?? primaryCol.key], record, index)
              : record[primaryCol.dataIndex ?? primaryCol.key]}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
            {bodyCols.map((c) => {
              const val = record[c.dataIndex ?? c.key]
              const content = c.render ? c.render(val, record, index) : val
              if (content === undefined || content === null || content === '') return null
              return (
                <div key={c.key} style={{ fontSize: 13, overflow: 'hidden' }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {c.title}
                  </Text>
                  <div style={{ wordBreak: 'break-all' }}>{content}</div>
                </div>
              )
            })}
          </div>
          {actionCol && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0' }} onClick={(e) => e.stopPropagation()}>
              {actionCol.render?.(record[actionCol.key], record, index)}
            </div>
          )}
        </Card>
      ))}
    </Space>
  )
}
