import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { useTabManager } from '../../hooks/useTabManager'
import { TabBar } from './TabBar'
import { SessionListView } from './SessionListView'
import { SessionTab } from './SessionTab'
import { MessageInput } from './MessageInput'
import type { TabItem, SessionInfo, ChatItem, SessionPhaseType } from './types'
import './styles.css'

/** Phase structure received from main process via IPC */
interface SessionPhase {
  type: string
  context?: Record<string, unknown>
}

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
        const sessionPhase = s.phase as SessionPhase | undefined
        const phase = sessionPhase?.type ?? 'idle'
        const context = sessionPhase?.type === 'waitingForApproval' ? sessionPhase.context : undefined
        const toolName = context?.toolName as string | undefined
        const toolInput = context?.toolInput as Record<string, unknown> | null | undefined

        sessionMap.set(sessionId, {
          phase,
          session: {
            sessionId,
            projectName: s.projectName as string,
            cwd: s.cwd as string,
            phase: phase as SessionInfo['phase'],
            source: (s.source as 'hook' | 'stream') ?? 'hook',
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

    loadSessions()

    return () => cleanup()
  }, [loadSessions])

  // Listen for tab navigation from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onNavigateToTab((_event: unknown, sessionId: string) => {
      const existing = tabManager.tabs.find(t => t.id === sessionId)
      if (existing) {
        tabManager.setActiveTabId(sessionId)
      } else {
        loadSessions().then(() => {
          setTimeout(() => {
            tabManager.setActiveTabId(sessionId)
          }, 100)
        })
      }
    })
    return () => cleanup()
  }, [tabManager, loadSessions])

  useEffect(() => {
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

    // Add/update tabs for active sessions
    for (const id of sessionIds) {
      const info = sessions.get(id)!
      const isStream = info.session.source === 'stream'
      const tabTitle = isStream ? `⚡ ${info.session.projectName}` : info.session.projectName
      const existing = tabManager.tabs.find(t => t.id === id)
      if (!existing) {
        tabManager.addTab({
          id,
          title: tabTitle,
          content: null,
          closable: isStream,
          source: isStream ? 'stream' : 'hook',
        })
      } else if (existing.title !== tabTitle) {
        existing.title = tabTitle
      }
    }
  }, [sessions, tabManager])

  const handleSessionClick = useCallback((sessionId: string) => {
    tabManager.setActiveTabId(sessionId)
  }, [tabManager])

  const handleApprove = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      const session = sessions.get(tabManager.activeTabId)
      if (session?.session.source === 'stream') {
        window.electronAPI.stream.approve(tabManager.activeTabId)
      } else {
        window.electronAPI.session.approve(tabManager.activeTabId)
      }
    }
  }, [tabManager.activeTabId, sessions])

  const handleDeny = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      const session = sessions.get(tabManager.activeTabId)
      if (session?.session.source === 'stream') {
        window.electronAPI.stream.deny(tabManager.activeTabId)
      } else {
        window.electronAPI.session.deny(tabManager.activeTabId)
      }
    }
  }, [tabManager.activeTabId, sessions])

  const handleAlwaysAllow = useCallback(() => {
    if (tabManager.activeTabId !== 'chat') {
      const session = sessions.get(tabManager.activeTabId)
      if (session?.session.source === 'stream') {
        window.electronAPI.stream.alwaysAllow(tabManager.activeTabId)
      } else {
        window.electronAPI.session.alwaysAllow(tabManager.activeTabId)
      }
    }
  }, [tabManager.activeTabId, sessions])

  const handleAnswer = useCallback((answer: string) => {
    if (tabManager.activeTabId !== 'chat') {
      const session = sessions.get(tabManager.activeTabId)
      if (session?.session.source === 'stream') {
        window.electronAPI.stream.answer(tabManager.activeTabId, answer)
      } else {
        window.electronAPI.session.answer(tabManager.activeTabId, answer)
      }
    }
  }, [tabManager.activeTabId, sessions])

  const handleJumpToTerminal = useCallback((sessionId: string) => {
    window.electronAPI.session.jumpToTerminal(sessionId)
  }, [])

  // Stream session creation
  const handleCreateStreamSession = useCallback(async (cwd: string) => {
    const result = await window.electronAPI.stream.create(cwd)
    if (result?.sessionId) {
      loadSessions()
    }
  }, [loadSessions])

  // Stream session message send
  const handleSendMessage = useCallback((text: string) => {
    if (tabManager.activeTabId && tabManager.activeTabId !== 'chat') {
      window.electronAPI.stream.send(tabManager.activeTabId, text)
    }
  }, [tabManager.activeTabId])

  // Stream session close on tab close
  const handleTabClose = useCallback((id: string) => {
    const session = sessions.get(id)
    if (session?.session.source === 'stream') {
      window.electronAPI.stream.destroy(id)
    }
    tabManager.removeTab(id)
  }, [tabManager, sessions])

  const activeTab = tabManager.tabs.find((t) => t.id === tabManager.activeTabId)

  const renderActiveTabContent = (): React.ReactNode => {
    if (tabManager.activeTabId === 'chat') {
      const sessionList = Array.from(sessions.values()).map((s) => s.session)
      return (
        <SessionListView
          sessions={sessionList}
          onSessionClick={handleSessionClick}
          onJumpToTerminal={handleJumpToTerminal}
          onCreateStreamSession={handleCreateStreamSession}
          onDestroyStream={handleTabClose}
        />
      )
    }

    const sessionData = sessions.get(tabManager.activeTabId)
    if (sessionData) {
      const items = sessionItems.get(tabManager.activeTabId) ?? []
      const isStream = sessionData.session.source === 'stream'
      return (
        <>
          <SessionTab
            session={sessionData.session}
            items={items}
            onAllow={handleApprove}
            onDeny={handleDeny}
            onAlwaysAllow={handleAlwaysAllow}
            onAnswer={handleAnswer}
            onJumpToTerminal={isStream ? undefined : () => handleJumpToTerminal(tabManager.activeTabId)}
          />
          {isStream && (
            <MessageInput
              onSend={handleSendMessage}
              phase={sessionData.phase}
            />
          )}
        </>
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
            onTabClose={handleTabClose}
          />
        )}
        <button className="chat-panel__close" onClick={handleClose} title="关闭">×</button>
      </div>

      <div className="chat-panel__content">{renderActiveTabContent()}</div>
    </div>
  )
}
