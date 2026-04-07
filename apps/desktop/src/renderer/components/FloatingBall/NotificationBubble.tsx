import React, { useCallback } from 'react'
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
}

const MAX_ROWS = 5

const PHASE_CONFIG = {
  waitingForApproval: { label: 'Approval', color: '#ff9800' },
  waitingForInput: { label: 'Input', color: '#2196f3' }
} as const

export function NotificationBubble({ interventions, visible, onRowClick }: NotificationBubbleProps): React.JSX.Element | null {
  if (!visible || interventions.length === 0) return null

  const displayItems = interventions.slice(0, MAX_ROWS)
  const overflowCount = interventions.length - MAX_ROWS

  const handleClick = useCallback((sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onRowClick(sessionId)
  }, [onRowClick])

  const handleMouseEnter = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(true)
  }, [])

  return (
    <div
      className="notification-bubble"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
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
