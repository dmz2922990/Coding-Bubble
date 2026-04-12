import React, { useCallback } from 'react'
import type { SessionInfo } from './types'
import './styles.css'

const PHASE_LABELS: Record<string, string> = {
  idle: '空闲',
  thinking: '思考中',
  processing: '处理中',
  done: '已完成',
  error: '出错',
  waitingForInput: '等待输入',
  waitingForApproval: '等待授权',
  compacting: '压缩中',
  ended: '已结束'
}

const PHASE_COLORS: Record<string, string> = {
  idle: '#888',
  thinking: '#ab47bc',
  processing: '#4caf50',
  done: '#66bb6a',
  error: '#f44336',
  waitingForInput: '#78909c',
  waitingForApproval: '#ff9800',
  compacting: '#2196f3',
  ended: '#9e9e9e'
}

interface Props {
  sessions: SessionInfo[]
  onSessionClick: (sessionId: string) => void
  onJumpToTerminal?: (sessionId: string) => void
  onCreateStreamSession?: (cwd: string) => void
  onDestroyStream?: (sessionId: string) => void
}

export function SessionListView({ sessions, onSessionClick, onJumpToTerminal, onCreateStreamSession, onDestroyStream }: Props): React.JSX.Element {
  const handleCreate = useCallback(async () => {
    if (!onCreateStreamSession) return
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select working directory',
    }) as { canceled: boolean; filePaths: string[] }
    if (!result.canceled && result.filePaths[0]) {
      onCreateStreamSession(result.filePaths[0])
    }
  }, [onCreateStreamSession])

  return (
    <div className="session-list-wrapper">
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="chat-panel__empty">
            没有活跃的 Claude 会话
          </div>
        ) : (
          sessions.map((s) => (
            <SessionCard key={s.sessionId} session={s} onClick={() => onSessionClick(s.sessionId)} onJumpToTerminal={s.source !== 'stream' && onJumpToTerminal ? () => onJumpToTerminal(s.sessionId) : undefined} onDestroy={s.source === 'stream' && onDestroyStream ? () => onDestroyStream(s.sessionId) : undefined} />
          ))
        )}
      </div>
      {onCreateStreamSession && (
        <button className="session-list__create-btn" onClick={handleCreate}>
          + 新建对话
        </button>
      )}
    </div>
  )
}

function SessionCard({ session, onClick, onJumpToTerminal, onDestroy }: { session: SessionInfo; onClick: () => void; onJumpToTerminal?: () => void; onDestroy?: () => void }): React.JSX.Element {
  const statusDotColor = PHASE_COLORS[session.phase] ?? '#888'
  const isWaitingApproval = session.phase === 'waitingForApproval'
  const isStream = session.source === 'stream'

  return (
    <div className={`session-card${isStream ? ' session-card--stream' : ''}`} onClick={onClick}>
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
        {onDestroy && (
          <button
            className="session-card__destroy-btn"
            onClick={(e) => { e.stopPropagation(); onDestroy() }}
            title="断开会话"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
