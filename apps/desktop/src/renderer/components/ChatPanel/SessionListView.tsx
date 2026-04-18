import React, { useCallback, useState, useEffect } from 'react'
import type { SessionInfo } from './types'
import './styles.css'

const PHASE_LABELS: Record<string, string> = {
  idle: '空闲',
  thinking: '思考中',
  processing: '处理中',
  juggling: '子任务中',
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
  processing: '#2196f3',
  juggling: '#ab47bc',
  done: '#66bb6a',
  error: '#f44336',
  waitingForInput: '#78909c',
  waitingForApproval: '#ff9800',
  compacting: '#2196f3',
  ended: '#9e9e9e'
}

interface RemoteServerInfo {
  config: { id: string; name: string; host: string; port: number }
  state: 'disconnected' | 'connecting' | 'connected'
}

interface DirEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

interface Props {
  sessions: SessionInfo[]
  onSessionClick: (sessionId: string) => void
  onJumpToTerminal?: (sessionId: string) => void
  onCreateStreamSession?: (cwd: string) => void
  onCreateRemoteStreamSession?: (serverId: string, cwd: string) => void
  onDestroyStream?: (sessionId: string) => void
}

export function SessionListView({ sessions, onSessionClick, onJumpToTerminal, onCreateStreamSession, onCreateRemoteStreamSession, onDestroyStream }: Props): React.JSX.Element {
  const [showRemoteDialog, setShowRemoteDialog] = useState(false)

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
            <SessionCard key={s.sessionId} session={s} onClick={() => onSessionClick(s.sessionId)} onJumpToTerminal={s.source === 'hook' && onJumpToTerminal ? () => onJumpToTerminal(s.sessionId) : undefined} onDestroy={(s.source === 'stream' || s.source === 'remote-stream') && onDestroyStream ? () => onDestroyStream(s.sessionId) : undefined} />
          ))
        )}
      </div>
      <div className="session-list__actions">
        {onCreateStreamSession && (
          <button className="session-list__create-btn" onClick={handleCreate}>
            + 本地对话
          </button>
        )}
        {onCreateRemoteStreamSession && (
          <button className="session-list__create-btn session-list__create-btn--remote" onClick={() => setShowRemoteDialog(true)}>
            + 远程对话
          </button>
        )}
      </div>
      {showRemoteDialog && (
        <RemoteSessionDialog
          onClose={() => setShowRemoteDialog(false)}
          onCreate={onCreateRemoteStreamSession!}
        />
      )}
    </div>
  )
}

// ── Remote Session Dialog ────────────────────────────────

function RemoteSessionDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (serverId: string, cwd: string) => void }): React.JSX.Element {
  const [servers, setServers] = useState<RemoteServerInfo[]>([])
  const [selectedServer, setSelectedServer] = useState<RemoteServerInfo | null>(null)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.electronAPI.remote.listServers().then((list) => {
      setServers(list as RemoteServerInfo[])
    })
  }, [])

  const loadDirectory = useCallback(async (serverId: string, dirPath?: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.remote.listDirectory(serverId, dirPath) as DirEntry[]
      setEntries(result.filter(e => e.type === 'directory'))
      setCurrentPath(dirPath ?? '~')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelectServer = useCallback((server: RemoteServerInfo) => {
    if (server.state !== 'connected') return
    setSelectedServer(server)
    loadDirectory(server.config.id)
  }, [loadDirectory])

  const handleNavigate = useCallback((entry: DirEntry) => {
    if (!selectedServer) return
    loadDirectory(selectedServer.config.id, entry.path)
  }, [selectedServer, loadDirectory])

  const handleGoUp = useCallback(() => {
    if (!selectedServer || !currentPath || currentPath === '~') return
    const parts = currentPath.split('/')
    parts.pop()
    const parentPath = parts.join('/') || '/'
    loadDirectory(selectedServer.config.id, parentPath)
  }, [selectedServer, currentPath, loadDirectory])

  const handleCreate = useCallback(() => {
    if (!selectedServer || !currentPath) return
    onCreate(selectedServer.config.id, currentPath)
    onClose()
  }, [selectedServer, currentPath, onCreate, onClose])

  if (!selectedServer) {
    return (
      <div className="remote-dialog">
        <div className="remote-dialog__header">
          <span className="remote-dialog__title">选择远程设备</span>
          <button className="remote-dialog__close" onClick={onClose}>×</button>
        </div>
        <div className="remote-dialog__body">
          {servers.length === 0 ? (
            <div className="remote-dialog__empty">暂无已配置的远程设备</div>
          ) : (
            servers.map((s) => (
              <button
                key={s.config.id}
                className={`remote-dialog__server${s.state === 'connected' ? ' remote-dialog__server--active' : ''}`}
                onClick={() => handleSelectServer(s)}
                disabled={s.state !== 'connected'}
              >
                <span className={`remote-dialog__dot remote-dialog__dot--${s.state}`} />
                <span className="remote-dialog__server-name">{s.config.name}</span>
                <span className="remote-dialog__server-addr">{s.config.host}:{s.config.port}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="remote-dialog">
      <div className="remote-dialog__header">
        <button className="remote-dialog__back" onClick={() => { setSelectedServer(null); setEntries([]); setCurrentPath('') }}>
          ←
        </button>
        <span className="remote-dialog__title">{selectedServer.config.name}</span>
        <button className="remote-dialog__close" onClick={onClose}>×</button>
      </div>
      <div className="remote-dialog__path">{currentPath}</div>
      <div className="remote-dialog__body">
        {loading ? (
          <div className="remote-dialog__empty">加载中...</div>
        ) : error ? (
          <div className="remote-dialog__empty remote-dialog__empty--error">{error}</div>
        ) : (
          <>
            {currentPath !== '~' && (
              <button className="remote-dialog__entry remote-dialog__entry--back" onClick={handleGoUp}>
                <span className="remote-dialog__entry-icon">📁</span>
                <span className="remote-dialog__entry-name">..</span>
              </button>
            )}
            {entries.length === 0 ? (
              <div className="remote-dialog__empty">无子目录</div>
            ) : (
              entries.map((e) => (
                <button key={e.path} className="remote-dialog__entry" onClick={() => handleNavigate(e)}>
                  <span className="remote-dialog__entry-icon">📁</span>
                  <span className="remote-dialog__entry-name">{e.name}</span>
                </button>
              ))
            )}
          </>
        )}
      </div>
      <div className="remote-dialog__footer">
        <button
          className="remote-dialog__create-btn"
          onClick={handleCreate}
          disabled={!currentPath}
        >
          在此目录创建会话
        </button>
      </div>
    </div>
  )
}

function SessionCard({ session, onClick, onJumpToTerminal, onDestroy }: { session: SessionInfo; onClick: () => void; onJumpToTerminal?: () => void; onDestroy?: () => void }): React.JSX.Element {
  const statusDotColor = PHASE_COLORS[session.phase] ?? '#888'
  const isWaitingApproval = session.phase === 'waitingForApproval'
  const isRemote = session.source?.startsWith('remote')

  return (
    <div className={`session-card session-card--${session.source ?? 'hook'}`} onClick={onClick}>
      <div className="session-card__row">
        <div className="session-card__info">
          <div className="session-card__header">
            <span className="session-card__dot" style={{ backgroundColor: statusDotColor }} />
            <span className="session-card__name">{session.projectName}</span>
            {isRemote && <span className="session-card__remote-badge">远程</span>}
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
