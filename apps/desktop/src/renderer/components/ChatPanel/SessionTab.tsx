import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatItem, SessionInfo } from './types'
import './styles.css'

const TOOL_STATUS_COLORS: Record<string, string> = {
  running: '#ff9800',
  success: '#4caf50',
  error: '#f44336',
  interrupted: '#9e9e9e',
  waitingForApproval: '#ff9800'
}

const PHASE_LABELS: Record<string, string> = {
  idle: '空闲',
  processing: '处理中',
  waitingForInput: '等待输入',
  waitingForApproval: '等待授权',
  compacting: '压缩中',
  ended: '已结束',
}

interface Props {
  session: SessionInfo
  items: ChatItem[]
  onAllow?: () => void
  onDeny?: () => void
  onAlwaysAllow?: () => void
}

export function SessionTab({ session, items, onAllow, onDeny, onAlwaysAllow }: Props): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    if (listRef.current && autoScroll) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [items, autoScroll])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setAutoScroll(atBottom)
    if (atBottom) setNewCount(0)
  }, [])

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    setAutoScroll(true)
    setNewCount(0)
  }, [])

  return (
    <div className="session-tab">
      <div className="session-tab__header">
        <span className="session-tab__name">{session.projectName}</span>
        <span className={`session-tab__phase-badge session-tab__phase-badge--${session.phase}`}>
          {PHASE_LABELS[session.phase] ?? session.phase}
        </span>
      </div>

      <div className="session-tab__details">
        <div className="session-tab__detail-row">
          <span className="session-tab__detail-label">工作目录</span>
          <span className="session-tab__detail-value" title={session.cwd}>{session.cwd}</span>
        </div>
      </div>

      <div className="session-tab__messages" ref={listRef} onScroll={handleScroll}>
        {session.phase === 'waitingForApproval' && session.toolName && (
          <ApprovalDetail toolName={session.toolName} toolInput={session.toolInput} />
        )}
        {items.length === 0 && session.phase !== 'waitingForApproval' ? (
          <div className="session-tab__empty">暂无对话记录</div>
        ) : (
          items.map((item) => (
            <MessageItem key={item.id} item={item} />
          ))
        )}
      </div>

      {!autoScroll && newCount > 0 && (
        <button className="session-tab__new-indicator" onClick={scrollToBottom}>
          ↓ {newCount} 条新消息
        </button>
      )}

      {session.phase === 'waitingForApproval' && (
        <PermissionBar
          toolName={session.toolName ?? 'unknown'}
          toolInput={session.toolInput}
          onAllow={onAllow}
          onDeny={onDeny}
          onAlwaysAllow={onAlwaysAllow}
        />
      )}
    </div>
  )
}

function MessageItem({ item }: { item: ChatItem }): React.JSX.Element {
  switch (item.type) {
    case 'user':
      return (
        <div className="chat-msg chat-msg--user">
          <div className="chat-msg__bubble">{item.content}</div>
        </div>
      )

    case 'assistant':
      return (
        <div className="chat-msg chat-msg--assistant">
          <div className="chat-msg__bubble">
            {item.content}
          </div>
        </div>
      )

    case 'toolCall':
      return <ToolItem tool={item.tool!} />

    case 'thinking':
      return <ThinkingItem content={item.content ?? ''} />

    case 'interrupted':
      return (
        <div className="chat-msg chat-msg--interrupted">
          <div className="chat-msg__interrupted">⚠️ 会话已中断</div>
        </div>
      )

    default:
      return null
  }
}

function ToolItem({ tool }: { tool: { name: string; input: Record<string, string>; status: string; result?: string } }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_STATUS_COLORS[tool.status] ?? '#888'
  const inputPreview = JSON.stringify(tool.input).slice(0, 80)

  return (
    <div className="chat-msg chat-msg--tool">
      <div className="chat-msg__tool" onClick={() => setExpanded(!expanded)}>
        <div className="chat-msg__tool-header">
          <span className="chat-msg__tool-dot" style={{ backgroundColor: color }} />
          <span className="chat-msg__tool-name">{tool.name}</span>
          <span className="chat-msg__tool-input">{inputPreview}</span>
        </div>
        {expanded && tool.result && (
          <pre className="chat-msg__tool-result">{tool.result}</pre>
        )}
      </div>
    </div>
  )
}

function ThinkingItem({ content }: { content: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const preview = content.slice(0, 80) + (content.length > 80 ? '...' : '')

  return (
    <div className="chat-msg chat-msg--thinking" onClick={() => setExpanded(!expanded)}>
      <div className="chat-msg__thinking">
        <span className="chat-msg__thinking-label">💭 思考</span>
        <span className="chat-msg__thinking-content">{expanded ? content : preview}</span>
      </div>
    </div>
  )
}

function ApprovalDetail({ toolName, toolInput }: { toolName: string; toolInput?: Record<string, unknown> | null }): React.JSX.Element {
  const command = typeof toolInput?.command === 'string' ? toolInput.command : ''
  return (
    <div className="approval-detail">
      <div className="approval-detail__title">工具请求授权</div>
      <div className="approval-detail__row">
        <span className="approval-detail__label">工具</span>
        <code className="approval-detail__value">{toolName}</code>
      </div>
      {command && (
        <div className="approval-detail__row approval-detail__row--col">
          <span className="approval-detail__label">命令</span>
          <pre className="approval-detail__json">{command}</pre>
        </div>
      )}
    </div>
  )
}

interface PermissionBarProps {
  toolName: string
  toolInput?: Record<string, unknown> | null
  onAllow?: () => void
  onDeny?: () => void
  onAlwaysAllow?: () => void
}

function PermissionBar({ toolName, onAllow, onDeny, onAlwaysAllow }: PermissionBarProps): React.JSX.Element {
  return (
    <div className="permission-bar">
      <div className="permission-bar__content">
        <div className="permission-bar__label">工具请求授权</div>
        <div className="permission-bar__tool">{toolName}</div>
      </div>
      <div className="permission-bar__actions">
        <button className="permission-bar__btn permission-bar__btn--deny" onClick={onDeny}>拒绝</button>
        <button className="permission-bar__btn permission-bar__btn--allow" onClick={onAllow}>允许</button>
        <button className="permission-bar__btn permission-bar__btn--always" onClick={onAlwaysAllow}>一直允许</button>
      </div>
    </div>
  )
}
