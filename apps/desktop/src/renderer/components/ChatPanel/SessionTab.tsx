import React, { useState, useRef, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  thinking: '思考中',
  processing: '处理中',
  done: '已完成',
  error: '出错',
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
  onAnswer?: (answer: string) => void
  onJumpToTerminal?: () => void
  onDisconnect?: () => void
}

export function SessionTab({ session, items, onAllow, onDeny, onAlwaysAllow, onAnswer, onJumpToTerminal, onDisconnect }: Props): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [newCount, setNewCount] = useState(0)
  const prevItemCountRef = useRef(items.length)

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    const added = items.length - prevItemCountRef.current
    prevItemCountRef.current = items.length

    if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight
      setNewCount(0)
    } else if (added > 0) {
      setNewCount((c) => c + added)
    }
  }, [items])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    autoScrollRef.current = atBottom
    if (atBottom) setNewCount(0)
  }, [])

  useEffect(() => {
    if (session.source !== 'stream') return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        window.electronAPI.stream.interrupt(session.sessionId)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [session.sessionId, session.source])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    autoScrollRef.current = true
    setNewCount(0)
  }, [])

  return (
    <div className="session-tab">
      <div className={`session-tab__header${onDisconnect ? ' session-tab__header--stream' : ''}`}>
        <span className="session-tab__name">{session.projectName}</span>
        <div className="session-tab__header-actions">
          <span className={`session-tab__phase-badge session-tab__phase-badge--${session.phase}`}>
            {PHASE_LABELS[session.phase] ?? session.phase}
          </span>
          {onJumpToTerminal && (
            <button
              className="session-tab__jump-btn"
              onClick={onJumpToTerminal}
              title="跳转到终端"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 3L7 8L2 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          {onDisconnect && (
            <button
              className="session-tab__jump-btn"
              onClick={onDisconnect}
              title="断开会话"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="session-tab__details">
        <div className="session-tab__detail-row">
          <span className="session-tab__detail-label">工作目录</span>
          <span className="session-tab__detail-value" title={session.cwd}>{session.cwd}</span>
        </div>
      </div>

      <div className="session-tab__messages" ref={listRef} onScroll={handleScroll}>
        {items.length === 0 && session.phase !== 'waitingForApproval' ? (
          <div className="session-tab__empty">暂无对话记录</div>
        ) : (
          items.map((item) => (
            <MessageItem key={item.id} item={item} />
          ))
        )}
      </div>

      {newCount > 0 && (
        <button className="session-tab__new-indicator" onClick={scrollToBottom}>
          ↓ {newCount} 条新消息
        </button>
      )}

      {session.phase === 'waitingForApproval' && session.toolName && session.toolName !== 'AskUserQuestion' && (
        <ApprovalDetail toolName={session.toolName} toolInput={session.toolInput} />
      )}

      {session.phase === 'waitingForApproval' && session.toolName === 'AskUserQuestion' ? (
        <AskUserQuestion
          question={(parseAskUserQuestion(session.toolInput)?.question) ?? ''}
          header={parseAskUserQuestion(session.toolInput)?.header}
          options={(parseAskUserQuestion(session.toolInput)?.options) ?? []}
          multiSelect={parseAskUserQuestion(session.toolInput)?.multiSelect}
          onAnswer={(answer) => {
            if (onAnswer) {
              if (Array.isArray(answer)) {
                onAnswer(JSON.stringify(answer))
              } else {
                onAnswer(answer)
              }
            }
          }}
          onDeny={onDeny ?? (() => {})}
        />
      ) : session.phase === 'waitingForApproval' ? (
        <PermissionBar
          toolName={session.toolName ?? 'unknown'}
          toolInput={session.toolInput}
          onAllow={onAllow}
          onDeny={onDeny}
          onAlwaysAllow={onAlwaysAllow}
        />
      ) : null}
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
          <div className="chat-msg__bubble chat-msg__markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre({ children }) {
                  return <>{children}</>
                },
                code({ className, children, ...props }) {
                  const isBlock = className?.includes('language-') || String(children).includes('\n')
                  return isBlock ? (
                    <pre className="chat-msg__code-block">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code className="chat-msg__inline-code" {...props}>
                      {children}
                    </code>
                  )
                },
                a({ node, children, ...props }) {
                  return (
                    <a {...props} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  )
                }
              }}
            >
              {item.content}
            </ReactMarkdown>
            {item.streaming && <span className="chat-msg__cursor" />}
          </div>
        </div>
      )

    case 'toolCall':
      return <ToolItem tool={item.tool!} elapsedSeconds={item.elapsedSeconds} />

    case 'thinking':
      return <ThinkingItem content={item.content ?? ''} />

    case 'interrupted':
      return (
        <div className="chat-msg chat-msg--interrupted">
          <div className="chat-msg__interrupted">⚠️ 会话已中断</div>
        </div>
      )

    case 'system':
      return (
        <div className="chat-msg chat-msg--system">
          <div className="chat-msg__system" dangerouslySetInnerHTML={{ __html: item.content }} />
        </div>
      )

    case 'systemStatus':
      return <SystemStatusItem statusKind={item.statusKind ?? ''} content={item.content ?? ''} />

    case 'resultSummary':
      return <ResultSummaryItem durationMs={item.durationMs} inputTokens={item.inputTokens} outputTokens={item.outputTokens} costUsd={item.costUsd} interrupted={item.interrupted} />

    default:
      return null
  }
}

function ToolItem({ tool, elapsedSeconds }: { tool: { name: string; input: Record<string, string>; status: string; result?: string }; elapsedSeconds?: number }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_STATUS_COLORS[tool.status] ?? '#888'
  const inputPreview = JSON.stringify(tool.input).slice(0, 80)

  return (
    <div className="chat-msg chat-msg--tool">
      <div className="chat-msg__tool" onClick={() => setExpanded(!expanded)}>
        <div className="chat-msg__tool-header">
          <span className="chat-msg__tool-dot" style={{ backgroundColor: color }} />
          <span className="chat-msg__tool-name">{tool.name}</span>
          {elapsedSeconds != null && elapsedSeconds > 0 && (
            <span className="chat-msg__tool-elapsed">· {elapsedSeconds}s</span>
          )}
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

function SystemStatusItem({ statusKind, content }: { statusKind: string; content: string }): React.JSX.Element {
  return (
    <div className={`chat-msg__system-status chat-msg__system-status--${statusKind}`}>
      {statusKind === 'compacting' && <span className="chat-msg__system-status-spinner" />}
      <span>{content}</span>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatTokens(n?: number): string {
  if (n == null) return ''
  return n.toLocaleString()
}

function ResultSummaryItem({ durationMs, inputTokens, outputTokens, costUsd, interrupted }: {
  durationMs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; interrupted?: boolean
}): React.JSX.Element {
  const parts: string[] = []
  if (interrupted) parts.push('已中断')
  if (durationMs != null) parts.push(formatDuration(durationMs))
  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0)
  if (totalTokens > 0) parts.push(`${formatTokens(totalTokens)} tokens`)
  if (costUsd != null && costUsd > 0) parts.push(`$${costUsd.toFixed(4)}`)

  if (parts.length === 0) return null

  return (
    <div className={`chat-msg__result-summary${interrupted ? ' chat-msg__result-summary--interrupted' : ''}`}>
      {parts.join(' · ')}
    </div>
  )
}

function DiffView({ oldString, newString, maxLines }: { oldString: string; newString: string; maxLines?: number }): React.JSX.Element {
  const oldLines = oldString.split('\n')
  const newLines = newString.split('\n')
  const limit = maxLines ?? 50
  const truncated = oldLines.length + newLines.length > limit

  // Simple line-level diff: show removals then additions
  const lines: Array<{ type: 'context' | 'remove' | 'add'; text: string }> = []

  // Find common prefix
  let prefixLen = 0
  while (prefixLen < oldLines.length && prefixLen < newLines.length && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  // Find common suffix
  let oldSuffixStart = oldLines.length - 1
  let newSuffixStart = newLines.length - 1
  while (oldSuffixStart > prefixLen && newSuffixStart > prefixLen && oldLines[oldSuffixStart] === newLines[newSuffixStart]) {
    oldSuffixStart--
    newSuffixStart--
  }

  const maxOld = Math.min(prefixLen + (truncated ? 3 : prefixLen), oldLines.length)
  const contextBefore = oldLines.slice(Math.max(0, prefixLen - 2), prefixLen)
  const contextAfter = oldLines.slice(oldSuffixStart + 1, Math.min(oldSuffixStart + 3, oldLines.length))

  const removedLines = oldLines.slice(prefixLen, oldSuffixStart + 1)
  const addedLines = newLines.slice(prefixLen, newSuffixStart + 1)

  // Build diff output
  for (const line of contextBefore) {
    lines.push({ type: 'context', text: line })
  }
  for (const line of removedLines.slice(0, truncated ? 20 : removedLines.length)) {
    lines.push({ type: 'remove', text: line })
  }
  if (truncated && removedLines.length > 20) {
    lines.push({ type: 'context', text: `... (${removedLines.length - 20} more lines)` })
  }
  for (const line of addedLines.slice(0, truncated ? 20 : addedLines.length)) {
    lines.push({ type: 'add', text: line })
  }
  if (truncated && addedLines.length > 20) {
    lines.push({ type: 'context', text: `... (${addedLines.length - 20} more lines)` })
  }
  for (const line of contextAfter) {
    lines.push({ type: 'context', text: line })
  }

  return (
    <pre className="diff-view">
      {lines.map((line, i) => (
        <div key={i} className={`diff-view__line diff-view__line--${line.type}`}>
          <span className="diff-view__marker">{line.type === 'remove' ? '-' : line.type === 'add' ? '+' : ' '}</span>
          <span className="diff-view__text">{line.text}</span>
        </div>
      ))}
    </pre>
  )
}

function ApprovalDetail({ toolName, toolInput }: { toolName: string; toolInput?: Record<string, unknown> | null }): React.JSX.Element {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : ''
  const command = typeof toolInput?.command === 'string' ? toolInput.command : ''
  const oldString = typeof toolInput?.old_string === 'string' ? toolInput.old_string : ''
  const newString = typeof toolInput?.new_string === 'string' ? toolInput.new_string : ''
  const replaceAll = toolInput?.replace_all === true

  const fileName = filePath ? filePath.split('/').pop() ?? filePath : ''
  const isEdit = toolName === 'Edit' || toolName === 'edit'

  return (
    <div className="approval-detail">
      <div className="approval-detail__title">工具请求授权</div>
      <div className="approval-detail__row">
        <span className="approval-detail__label">工具</span>
        <code className="approval-detail__value">{toolName}</code>
      </div>
      {filePath && (
        <div className="approval-detail__row">
          <span className="approval-detail__label">文件</span>
          <code className="approval-detail__value" title={filePath}>{fileName}</code>
        </div>
      )}
      {isEdit && oldString && newString ? (
        <DiffView oldString={oldString} newString={newString} />
      ) : command ? (
        <div className="approval-detail__row approval-detail__row--col">
          <span className="approval-detail__label">命令</span>
          <pre className="approval-detail__json">{command}</pre>
        </div>
      ) : null}
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

// ── AskUserQuestion Component ─────────────────────────────────────

interface AskUserQuestionProps {
  question: string
  header?: string
  options: Array<{ label: string; description: string }>
  multiSelect?: boolean
  onAnswer: (answer: string | string[]) => void
  onDeny: () => void
}

function AskUserQuestion({
  question,
  header = '请选择',
  options,
  multiSelect = false,
  onAnswer,
  onDeny
}: AskUserQuestionProps): React.JSX.Element {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = React.useState('')

  const handleSelect = (label: string) => {
    const newSelected = new Set(selected)
    if (multiSelect) {
      if (newSelected.has(label)) {
        newSelected.delete(label)
      } else {
        newSelected.add(label)
      }
    } else {
      newSelected.clear()
      newSelected.add(label)
    }
    setSelected(newSelected)
  }

  const handleConfirm = () => {
    if (selected.size === 0) return
    if (multiSelect) {
      onAnswer(Array.from(selected))
    } else {
      onAnswer(Array.from(selected)[0])
    }
  }

  const handleSendCustom = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    if (multiSelect) {
      const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      onAnswer(lines)
    } else {
      onAnswer(trimmed)
    }
  }

  return (
    <div className="ask-user-question">
      {header && <div className="aqu-header">{header}</div>}
      <div className="aqu-question">{question}</div>

      <div className="aqu-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`aqu-option ${selected.has(opt.label) ? 'selected' : ''}`}
            onClick={() => handleSelect(opt.label)}
          >
            <span className="aqu-option-label">{opt.label}</span>
            {multiSelect && (
              <span className="aqu-option-check">
                {selected.has(opt.label) ? '✓' : ''}
              </span>
            )}
            <span className="aqu-option-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      <div className="aqu-custom-input">
        <textarea
          className="aqu-textarea"
          placeholder={multiSelect
            ? '或直接输入自定义答案（多个答案用换行分隔）...'
            : '或直接输入自定义答案...'}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          rows={multiSelect ? 3 : 2}
        />
      </div>

      <div className="aqu-actions">
        <button
          className="aqu-btn-send"
          onClick={handleSendCustom}
          disabled={!customInput.trim()}
        >
          发送自定义答案
        </button>
        <button
          className="aqu-btn-confirm"
          onClick={handleConfirm}
          disabled={selected.size === 0}
        >
          确认选择{selected.size > 0 && ` (${selected.size})`}
        </button>
      </div>

      <button className="aqu-btn-deny" onClick={onDeny}>
        拒绝此请求
      </button>
    </div>
  )
}

// ── Helper: Parse AskUserQuestion data ───────────────────────────

interface QuestionData {
  question: string
  header?: string
  options: Array<{ label: string; description: string }>
  multiSelect?: boolean
}

function parseAskUserQuestion(toolInput: unknown): QuestionData | null {
  if (!toolInput || typeof toolInput !== 'object') return null

  const input = toolInput as Record<string, unknown>
  const questions = input.questions as Array<unknown>

  if (!questions || questions.length === 0) return null

  const q = questions[0] as Record<string, unknown>
  return {
    question: (q.question as string) ?? '',
    header: (q.header as string) ?? undefined,
    options: (q.options as Array<{ label: string; description: string }>) ?? [],
    multiSelect: (q.multiSelect as boolean) ?? false
  }
}
