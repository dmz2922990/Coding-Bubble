import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { BubbleNotification, NotificationType } from '../FloatingBall/NotificationBubble'
import './styles.css'

const MAX_ROWS = 5

const NOTIFICATION_CONFIG: Record<NotificationType, { label: string; color: string; icon: string }> = {
  approval: { label: '请求授权', color: '#ff9800', icon: '🔐' },
  input: { label: '等待输入', color: '#78909c', icon: '💬' },
  done: { label: '任务完成', color: '#66bb6a', icon: '✅' },
  error: { label: '执行出错', color: '#f44336', icon: '❌' },
}

const TYPE_PRIORITY: Record<NotificationType, number> = {
  approval: 4,
  error: 3,
  input: 2,
  done: 1,
}

export function NotificationWindow(): React.JSX.Element {
  const [notifications, setNotifications] = useState<BubbleNotification[]>([])
  const [quickApproval, setQuickApproval] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sorted = [...notifications].sort(
    (a, b) => (TYPE_PRIORITY[b.type] ?? 0) - (TYPE_PRIORITY[a.type] ?? 0)
  )

  // Auto-close timer
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (sorted.length === 0) return

    const hasNeverClose = sorted.some(n => n.autoCloseMs === 0)
    if (hasNeverClose) return

    const minAutoClose = Math.min(...sorted.map(n => n.autoCloseMs))
    timerRef.current = setTimeout(() => {
      for (const n of sorted) {
        window.electronAPI.dismissNotification(n.sessionId)
      }
    }, minAutoClose)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sorted])

  // IPC: receive notification data
  useEffect(() => {
    const cleanupShow = window.electronAPI.onBubbleShow((_event, data, qa) => {
      setNotifications(data as BubbleNotification[])
      if (qa !== undefined) setQuickApproval(qa)
    })
    const cleanupHide = window.electronAPI.onBubbleHide(() => {
      setNotifications([])
    })
    return () => {
      cleanupShow()
      cleanupHide()
    }
  }, [])

  // ResizeObserver: measure content and notify main process
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        window.electronAPI.notificationResize(
          Math.round(width),
          Math.round(height)
        )
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleRowClick = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    window.electronAPI.navigateToSession(sessionId)
  }, [])

  const handleDismiss = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(n => n.sessionId !== sessionId))
    window.electronAPI.dismissNotification(sessionId)
  }, [])

  const handleApprove = useCallback((sessionId: string, source?: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(n => n.sessionId !== sessionId))
    window.electronAPI.quickApprove(sessionId, source)
  }, [])

  if (sorted.length === 0) return <div ref={containerRef} className="notification-win" />

  const displayItems = sorted.slice(0, MAX_ROWS)
  const overflowCount = sorted.length - MAX_ROWS

  return (
    <div ref={containerRef} className="notification-win">
      <div className="notification-win__list">
        {displayItems.map((item) => {
          const config = NOTIFICATION_CONFIG[item.type]
          return (
            <div
              key={item.sessionId}
              className="notification-win__row"
              onClick={handleRowClick(item.sessionId)}
            >
              <span className="notification-win__indicator" style={{ backgroundColor: config.color }} />
              <div className="notification-win__info">
                <span className="notification-win__name">{item.projectName}</span>
                <span className="notification-win__status" style={{ color: config.color }}>
                  {config.icon} {config.label}
                  {item.toolName && <span className="notification-win__tool"> {item.toolName}</span>}
                </span>
              </div>
              {quickApproval && item.type === 'approval' && !item.isAskUserQuestion && (
                <button
                  className="notification-win__approve"
                  onClick={handleApprove(item.sessionId, item.source)}
                >
                  允许
                </button>
              )}
              <button
                className="notification-win__row-close"
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
        <div className="notification-win__overflow">+{overflowCount} more</div>
      )}
    </div>
  )
}
