import React, { useCallback, useEffect, useMemo } from 'react'
import { useClawSocket } from '../../hooks/useClawSocket'
import { useTabManager } from '../../hooks/useTabManager'
import { TabBar } from './TabBar'
import { ChatView } from './ChatView'
import type { TabItem } from './types'
import './styles.css'

export function ChatPanel(): React.JSX.Element {
  const { connectionState, messages, statusText } = useClawSocket()

  const chatTab: TabItem = useMemo(
    () => ({
      id: 'chat',
      title: '对话',
      closable: false,
      content: <ChatView messages={messages} connectionState={connectionState} statusText={statusText} />
    }),
    [messages, connectionState, statusText]
  )

  const testTabs: TabItem[] = useMemo(
    () => [
      {
        id: 'notes',
        title: '笔记',
        closable: true,
        content: (
          <div style={{ padding: '20px', color: '#f0f0f0' }}>
            <h3>📝 笔记面板</h3>
            <p>这是一个测试标签页，用于演示动态 Tab 功能。</p>
            <p>后续可以在这里添加笔记编辑功能。</p>
          </div>
        )
      },
      {
        id: 'tools',
        title: '工具',
        closable: true,
        content: (
          <div style={{ padding: '20px', color: '#f0f0f0' }}>
            <h3>🔧 工具箱</h3>
            <p>这是一个测试标签页。</p>
            <p>后续可以在这里添加各种实用工具。</p>
          </div>
        )
      }
    ],
    []
  )

  const tabManager = useTabManager([chatTab, ...testTabs])

  useEffect(() => {
    tabManager.addTab(chatTab)
  }, [chatTab, tabManager.addTab])

  const handleClose = useCallback(() => {
    window.electronAPI.closeWindow()
  }, [])

  const activeTab = tabManager.tabs.find((t) => t.id === tabManager.activeTabId)

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        {tabManager.tabs.length <= 1 ? (
          <div className="chat-panel__title">{activeTab?.title ?? '对话'}</div>
        ) : (
          <TabBar
            tabs={tabManager.tabs}
            activeTabId={tabManager.activeTabId}
            onTabSelect={tabManager.setActiveTabId}
            onTabClose={tabManager.removeTab}
          />
        )}
        <button className="chat-panel__close" onClick={handleClose} title="关闭">×</button>
      </div>

      <div className="chat-panel__content">{activeTab?.content}</div>
    </div>
  )
}
