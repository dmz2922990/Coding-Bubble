import React, { useCallback } from 'react'
import type { SessionInfo } from './types'
import './styles.css'

const PHASE_LABELS: Record<string, string> = {
  idle: '空闲',
  processing: '处理中',
  waitingForInput: '等待输入',
  waitingForApproval: '等待授权',
  compacting: '压缩中',
  ended: '已结束'
}

const PHASE_COLORS: Record<string, string> = {
  idle: '#888',
  processing: '#4caf50',
  waitingForInput: '#888',
  waitingForApproval: '#ff9800',
  compacting: '#2196f3',
  ended: '#f44336'
}

interface Props {
  sessions: SessionInfo[]
  onSessionClick: (sessionId: string) => void
  onJumpToTerminal?: (sessionId: string) => void
}

export function SessionListView({ sessions, onSessionClick, onJumpToTerminal }: Props): React.JSX.Element {
  if (sessions.length === 0) {
    return (
      <div className="chat-panel__empty">
        没有活跃的 Claude 会话
      </div>
    )
  }

  return (
    <div className="session-list">
      {sessions.map((s) => (
        <SessionCard key={s.sessionId} session={s} onClick={() => onSessionClick(s.sessionId)} onJumpToTerminal={onJumpToTerminal ? () => onJumpToTerminal(s.sessionId) : undefined} />
      ))}
    </div>
  )
}

function SessionCard({ session, onClick, onJumpToTerminal }: { session: SessionInfo; onClick: () => void; onJumpToTerminal?: () => void }): React.JSX.Element {
  const statusDotColor = PHASE_COLORS[session.phase] ?? '#888'
  const isWaitingApproval = session.phase === 'waitingForApproval'

  return (
    <div className="session-card" onClick={onClick}>
      <div className="session-card__row">
        <div className="session-card__info">
          <div className="session-card__header">
            <span className="session-card__dot" style={{ backgroundColor: statusDotColor }} />
            <span className="session-card__name">{session.projectName}</span>
          </div>
          <div className="session-card__path">{session.cwd}</div>
          <div className="session-card__status" style={{ color: statusDotColor }}>
            {PHASE_LABELS[session.phase] ?? session.phase}
            {isWaitingApproval && session.toolName && (
              <span className="session-card__tool">{session.toolName}</span>
            )}
          </div>
        </div>
        {onJumpToTerminal && (
          <button
            className="session-card__jump-btn"
            onClick={(e) => { e.stopPropagation(); onJumpToTerminal() }}
            title="跳转到终端"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 3L7 8L2 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
