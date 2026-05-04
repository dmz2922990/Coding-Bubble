import React, { useCallback, useEffect, useState } from 'react'

interface HistoryEntry {
  sessionId: string
  projectName: string
  cwd: string
  source: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'
  summary: string
  closedAt: number
  createdAt: number
}

interface HistoryViewProps {
  onBack: () => void
}

const PAGE_SIZE = 20

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 30) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const SOURCE_ACCENT: Record<string, string> = {
  hook: 'rgba(158, 158, 158, 0.4)',
  stream: '#4fc3f7',
  'remote-hook': 'rgba(158, 158, 158, 0.4)',
  'remote-stream': '#4fc3f7',
}

export function HistoryView({ onBack }: HistoryViewProps): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const loadHistory = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.history.query(p, PAGE_SIZE)
      setEntries(result.entries as HistoryEntry[])
      setTotalCount(result.totalCount)
    } catch {
      setEntries([])
      setTotalCount(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadHistory(page)
  }, [page, loadHistory])

  return (
    <div className="history-view">
      <div className="history-view__header">
        <button className="history-view__back-btn" onClick={onBack} title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="history-view__title">会话历史</span>
      </div>

      <div className="history-view__list">
        {loading ? (
          <div className="history-view__empty">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="history-view__empty">暂无会话历史</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.sessionId} className="history-card" style={{ borderLeftColor: SOURCE_ACCENT[entry.source] }}>
              <div className="history-card__summary">{entry.summary}</div>
              <div className="history-card__meta">
                <span className="history-card__cwd" title={entry.cwd}>{entry.cwd}</span>
                <span className="history-card__time">{formatRelativeTime(entry.closedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="history-pagination">
          <button
            className="history-pagination__btn"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className="history-pagination__indicator">{page} / {totalPages}</span>
          <button
            className="history-pagination__btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
