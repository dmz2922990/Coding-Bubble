import React, { useCallback, useEffect, useRef } from 'react'
import './NotificationBubble.css'

export interface InterventionItem {
  sessionId: string
  projectName: string
  phase: 'waitingForApproval' | 'waitingForInput'
  toolName?: string
}

interface NotificationBubbleProps {
  interventions: InterventionItem[]
  visible: boolean
  onRowClick: (sessionId: string) => void
  onClose: () => void
  autoCloseTimeout?: number
}

const MAX_ROWS = 5
const DEFAULT_AUTO_CLOSE = 15_000

const PHASE_CONFIG = {
  waitingForApproval: { label: 'Approval', color: '#ff9800' },
  waitingForInput: { label: 'Input', color: '#2196f3' }
} as const

export function NotificationBubble({ interventions, visible, onRowClick, onClose, autoCloseTimeout = DEFAULT_AUTO_CLOSE }: NotificationBubbleProps): React.JSX.Element | null {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-close timer: only when all items are Input type
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!visible || interventions.length === 0) return

    const hasApproval = interventions.some(i => i.phase === 'waitingForApproval')
    if (!hasApproval) {
      timerRef.current = setTimeout(onClose, autoCloseTimeout)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [visible, interventions, autoCloseTimeout, onClose])

  const handleClick = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onRowClick(sessionId)
  }, [onRowClick])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }, [onClose])

  const handleMouseEnter = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(true)
  }, [])

  if (!visible || interventions.length === 0) return null

  const displayItems = interventions.slice(0, MAX_ROWS)
  const overflowCount = interventions.length - MAX_ROWS

  return (
    <div
      className="notification-bubble"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button className="notification-bubble__close" onClick={handleClose} aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <div className="notification-bubble__list">
        {displayItems.map((item) => {
          const config = PHASE_CONFIG[item.phase]
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
                  {config.label}
                </span>
              </div>
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
