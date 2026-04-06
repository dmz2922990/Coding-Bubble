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
      content: null
    }),
    []
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
      },
      {
        id: 'history',
        title: '历史',
        closable: true,
        content: (
          <div style={{ padding: '20px', color: '#f0f0f0' }}>
            <h3>📜 历史记录</h3>
            <p>这是一个测试标签页。</p>
            <p>后续可以在这里查看历史对话记录。</p>
          </div>
        )
      },
      {
        id: 'settings',
        title: '设置',
        closable: true,
        content: (
          <div style={{ padding: '20px', color: '#f0f0f0' }}>
            <h3>⚙️ 设置</h3>
            <p>这是一个测试标签页。</p>
            <p>后续可以在这里修改应用配置。</p>
          </div>
        )
      },
      {
        id: 'about',
        title: '关于',
        closable: true,
        content: (
          <div style={{ padding: '20px', color: '#f0f0f0' }}>
            <h3>ℹ️ 关于</h3>
            <p>Coding-bubble v0.0.3</p>
            <p>桌面 AI 伴侣助手</p>
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClose])

  const activeTab = tabManager.tabs.find((t) => t.id === tabManager.activeTabId)

  const renderActiveTabContent = (): React.ReactNode => {
    if (tabManager.activeTabId === 'chat') {
      return (
        <ChatView
          messages={messages}
          connectionState={connectionState}
          statusText={statusText}
          tabs={tabManager.tabs}
          activeTabId={tabManager.activeTabId}
          tabManager={tabManager}
        />
      )
    }
    return activeTab?.content ?? null
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        {tabManager.tabs.length <= 1 ? (
          <div className="chat-panel__title">{activeTab?.title ?? '对话'}</div>
        ) : (
          <TabBar
            tabs={tabManager.tabs}
            chatTab={chatTab}
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
