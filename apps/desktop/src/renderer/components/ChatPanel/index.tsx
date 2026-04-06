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

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.electronAPI.session.list()
      const sessionMap = new Map<string, { phase: string; session: SessionInfo }>()
      const itemsMap = new Map<string, ChatItem[]>()

      for (const s of (list as Record<string, unknown>[])) {
        const sessionId = s.sessionId as string
        const phaseObj = s.phase as Record<string, unknown> | undefined
        const phase = (phaseObj?.type as string) ?? 'idle'
        // For waitingForApproval, toolName and toolInput are in phase.context
        const context = phaseObj?.context as Record<string, unknown> | undefined
        const toolName = context?.toolName as string | undefined
        const toolInput = context?.toolInput as Record<string, unknown> | null | undefined

        sessionMap.set(sessionId, {
          phase,
          session: {
            sessionId,
            projectName: s.projectName as string,
            cwd: s.cwd as string,
            phase: phase as SessionInfo['phase'],
            lastActivity: s.lastActivity as number,
            toolName: toolName || undefined,
            toolInput: toolInput || undefined,
          }
        })
        itemsMap.set(sessionId, (s.chatItems as ChatItem[]) ?? [])
      }
      setSessions(sessionMap)
      setSessionItems(itemsMap)
    } catch {
      // ignore
    }
  }, [])

  // Listen for session updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.session.onUpdate((_event: unknown, data: unknown) => {
      const msg = data as Record<string, unknown> | undefined
      if (!msg || !msg.sessionId) return

      const sessionType = (msg.type as string) ?? ''

      if (sessionType === 'session:new' || sessionType === 'session:update' || sessionType === 'session:permission') {
        loadSessions()
      } else if (sessionType === 'session:ended') {
        const sid = msg.sessionId as string
        setSessions(prev => {
          const next = new Map(prev)
          next.delete(sid)
          return next
        })
        setSessionItems(prev => {
          const next = new Map(prev)
          next.delete(sid)
          return next
        })
      } else if (sessionType === 'session:history') {
        const sid = msg.sessionId as string
        const items = (msg.items as ChatItem[]) ?? []
        setSessionItems(prev => new Map(prev).set(sid, items))
      }
    })

    // Load existing sessions on mount
    loadSessions()

    return () => cleanup()
  }, [loadSessions])

  useEffect(() => {
    // Check hook status on mount
    window.electronAPI.session.hooksStatus().then(setHookStatus).catch(() => {})
  }, [])

  // Sync tabs with active sessions
  useEffect(() => {
    const sessionIds = new Set(sessions.keys())

    // Remove tabs for ended sessions
    const tabsToRemove = tabManager.tabs.filter(
      t => t.id !== 'chat' && !sessionIds.has(t.id)
    )
    for (const tab of tabsToRemove) {
      tabManager.removeTab(tab.id)
    }

    // Add new tabs for active sessions
    for (const id of sessionIds) {
      const info = sessions.get(id)!
      const existing = tabManager.tabs.find(t => t.id === id)
      if (!existing) {
        tabManager.addTab({
          id,
          title: info.session.projectName,
          content: null,
          closable: false,
        })
      } else if (existing.title !== info.session.projectName) {
        existing.title = info.session.projectName
      }
    }
  }, [sessions, tabManager])

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

  const handleAlwaysAllow = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      window.electronAPI.session.alwaysAllow(tabManager.activeTabId)
    }
  }, [tabManager.activeTabId])

  const handleAnswer = useCallback((answer: string) => {
    if (tabManager.activeTabId !== 'chat') {
      window.electronAPI.session.answer(tabManager.activeTabId, answer)
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
          onAlwaysAllow={handleAlwaysAllow}
          onAnswer={handleAnswer}
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
    () => tabManager.tabs.map((t) => {
      if (t.id === 'chat') return { ...t, content: null }
      const s = sessions.get(t.id)
      return { ...t, content: null, phase: s?.phase as SessionPhaseType | undefined }
    }),
    [tabManager.tabs, sessions]
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
