import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { useTabManager } from '../../hooks/useTabManager'
import { TabBar } from './TabBar'
import { SessionListView } from './SessionListView'
import { SessionTab } from './SessionTab'
import type { TabItem, SessionInfo, ChatItem } from './types'
import './styles.css'

export function ChatPanel(): React.JSX.Element {
  const [sessions, setSessions] = useState<Map<string, { phase: string; session: SessionInfo }>>(new Map())
  const [sessionItems, setSessionItems] = useState<Map<string, ChatItem[]>>(new Map())
  const [activeSessionTab, setActiveSessionTab] = useState<string | null>(null)
  const [hookStatus, setHookStatus] = useState<{ installed: boolean }>({ installed: false })

  const chatTab = useMemo<Omit<TabItem, 'content'>>(
    () => ({ id: 'chat', title: '对话', closable: false }),
    []
  )

  const tabManager = useTabManager([
    { ...chatTab, content: null }
  ])

  // Listen for session updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.session.onUpdate((_event: unknown, data: unknown) => {
      const msg = data as Record<string, unknown> | undefined
      if (!msg || !msg.sessionId) return

      const sessionType = (msg.type as string) ?? ''

      if (sessionType === 'session:new') {
        // Reload session list
        loadSessions()
      } else if (sessionType === 'session:ended') {
        // Remove session tab
        const sid = msg.sessionId as string
        setSessions((prev) => {
          const next = new Map(prev)
          next.delete(sid)
          setActiveSessionTab(null)
          return next
        })
        // Switch to chat tab if active tab was removed
        if (tabManager.activeTabId === sid) {
          tabManager.setActiveTabId('chat')
        }
      } else if (sessionType === 'session:update') {
        loadSessions()
      } else if (sessionType === 'session:history') {
        const sid = msg.sessionId as string
        const items = (msg.items as ChatItem[]) ?? []
        setSessionItems((prev) => new Map(prev).set(sid, items))
      }
    })
    return () => cleanup()
  }, [])

  useEffect(() => {
    // Check hook status on mount
    window.electronAPI.session.hooksStatus().then(setHookStatus).catch(() => {})
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.electronAPI.session.list()
      const sessionMap = new Map<string, { phase: string; session: SessionInfo }>()
      const itemsMap = new Map<string, ChatItem[]>()

      for (const s of (list as Record<string, unknown>[])) {
        const sessionId = s.sessionId as string
        const phase = (s.phase as Record<string, unknown>)?.type as string ?? 'idle'
        sessionMap.set(sessionId, {
          phase,
          session: {
            sessionId,
            projectName: s.projectName as string,
            cwd: s.cwd as string,
            phase: phase as SessionInfo['phase'],
            lastActivity: s.lastActivity as number
          }
        })
        itemsMap.set(sessionId, (s.chatItems as ChatItem[]) ?? [])
      }
      setSessions(sessionMap)
      setSessionItems(itemsMap)

      // Create/remove tabs based on sessions
      const currentTabs = tabManager.tabs
      const sessionIds = Array.from(sessionMap.keys())

      for (const id of sessionIds) {
        const info = sessionMap.get(id)!
        if (!currentTabs.find((t) => t.id === id)) {
          tabManager.addTab({
            id,
            title: info.session.projectName,
            content: null,
            closable: false
          })
        } else {
          // Update tab title
          const idx = currentTabs.findIndex((t) => t.id === id)
          if (idx >= 0) {
            currentTabs[idx].title = info.session.projectName
          }
        }
      }
    } catch {
      // ignore
    }
  }, [tabManager])

  const handleSessionClick = useCallback((sessionId: string) => {
    tabManager.setActiveTabId(sessionId)
  }, [tabManager])

  const handleApprove = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      window.electronAPI.session.approve(tabManager.activeTabId)
    }
  }, [tabManager.activeTabId])

  const handleDeny = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      window.electronAPI.session.deny(tabManager.activeTabId)
    }
  }, [tabManager.activeTabId])

  const activeTab = tabManager.tabs.find((t) => t.id === tabManager.activeTabId)

  const renderActiveTabContent = (): React.ReactNode => {
    if (tabManager.activeTabId === 'chat') {
      const sessionList = Array.from(sessions.values()).map((s) => s.session)
      return <SessionListView sessions={sessionList} onSessionClick={handleSessionClick} />
    }

    const sessionData = sessions.get(tabManager.activeTabId)
    if (sessionData) {
      const items = sessionItems.get(tabManager.activeTabId) ?? []
      return (
        <SessionTab
          session={sessionData.session}
          items={items}
          onAllow={handleApprove}
          onDeny={handleDeny}
        />
      )
    }

    return null
  }

  const handleClose = useCallback(() => {
    window.electronAPI.closeWindow()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const allTabs = useMemo(
    () => tabManager.tabs.map((t) =>
      t.id === 'chat' ? { ...t, content: null } : t
    ),
    [tabManager.tabs]
  )

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        {allTabs.length <= 1 ? (
          <div className="chat-panel__title">{chatTab.title}</div>
        ) : (
          <TabBar
            tabs={allTabs}
            chatTab={allTabs.find((t) => t.id === 'chat')}
            activeTabId={tabManager.activeTabId}
            onTabSelect={tabManager.setActiveTabId}
            onTabClose={tabManager.removeTab}
          />
        )}
        <button className="chat-panel__close" onClick={handleClose} title="关闭">×</button>
      </div>

      <div className="chat-panel__content">{renderActiveTabContent()}</div>
    </div>
  )
}
