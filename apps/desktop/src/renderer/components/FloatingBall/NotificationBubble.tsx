import React, { useCallback, useEffect, useRef } from 'react'
import './NotificationBubble.css'

export type NotificationType = 'approval' | 'input' | 'done' | 'error'

export interface BubbleNotification {
  sessionId: string
  projectName: string
  type: NotificationType
  toolName?: string
  timestamp: number
  autoCloseMs: number
}

interface NotificationBubbleProps {
  notifications: BubbleNotification[]
  visible: boolean
  onRowClick: (sessionId: string) => void
  onDismissSession: (sessionId: string) => void
}

const MAX_ROWS = 5

const NOTIFICATION_CONFIG: Record<NotificationType, { label: string; color: string; icon: string }> = {
  approval: { label: '请求授权', color: '#ff9800', icon: '🔐' },
  input: { label: '等待输入', color: '#78909c', icon: '💬' },
  done: { label: '任务完成', color: '#66bb6a', icon: '✅' },
  error: { label: '执行出错', color: '#f44336', icon: '❌' },
}

// Priority: approval > error > input > done
const TYPE_PRIORITY: Record<NotificationType, number> = {
  approval: 4,
  error: 3,
  input: 2,
  done: 1,
}

export function NotificationBubble({ notifications, visible, onRowClick, onDismissSession }: NotificationBubbleProps): React.JSX.Element | null {
  // Auto-close timer — picks minimum autoCloseMs across all timed notifications
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sorted = [...notifications].sort(
    (a, b) => (TYPE_PRIORITY[b.type] ?? 0) - (TYPE_PRIORITY[a.type] ?? 0)
  )

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!visible || sorted.length === 0) return

    const hasNeverClose = sorted.some(n => n.autoCloseMs === 0)
    if (hasNeverClose) return

    const minAutoClose = Math.min(...sorted.map(n => n.autoCloseMs))
    timerRef.current = setTimeout(() => {
      // Dismiss all timed notifications
      for (const n of sorted) {
        onDismissSession(n.sessionId)
      }
    }, minAutoClose)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [visible, sorted, onDismissSession])

  const handleClick = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onRowClick(sessionId)
  }, [onRowClick])

  const handleDismiss = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onDismissSession(sessionId)
  }, [onDismissSession])

  const handleMouseEnter = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(true)
  }, [])

  if (!visible || sorted.length === 0) return null

  const displayItems = sorted.slice(0, MAX_ROWS)
  const overflowCount = sorted.length - MAX_ROWS

  return (
    <div
      className="notification-bubble"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="notification-bubble__list">
        {displayItems.map((item) => {
          const config = NOTIFICATION_CONFIG[item.type]
          return (
            <div
              key={item.sessionId}
              className="notification-bubble__row"
              onClick={handleClick(item.sessionId)}
            >
              <span className="notification-bubble__indicator" style={{ backgroundColor: config.color }} />
              <div className="notification-bubble__info">
                <span className="notification-bubble__name">{item.projectName}</span>
                <span className="notification-bubble__status" style={{ color: config.color }}>
                  {config.icon} {config.label}
                  {item.toolName && <span className="notification-bubble__tool"> {item.toolName}</span>}
                </span>
              </div>
              <button
                className="notification-bubble__row-close"
                onClick={handleDismiss(item.sessionId)}
                aria-label="Close"
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
      {overflowCount > 0 && (
        <div className="notification-bubble__overflow">+{overflowCount} more</div>
      )}
    </div>
  )
}
