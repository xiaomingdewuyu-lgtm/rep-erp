import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

// 全局错误边界：任何页面渲染崩溃时显示错误而非白屏，便于定位问题
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('页面渲染错误:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#cf1322' }}>页面出错了</h2>
          <p style={{ color: '#666' }}>该页面渲染时发生异常，已被错误边界捕获（不会再白屏）。请把下方错误信息发给我：</p>
          <pre
            style={{
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid #1677ff', background: '#1677ff', color: '#fff', cursor: 'pointer' }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
