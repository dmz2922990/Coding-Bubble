import React, { useRef, useCallback, useEffect } from 'react'
import type { ConnectionState, ChatMessage } from '../../hooks/useClawSocket'
import type { TabItem, TabManager } from './types'
import './styles.css'

interface Props {
  messages: ChatMessage[]
  connectionState: ConnectionState
  statusText: string
  tabs: TabItem[]
  activeTabId: string
  tabManager: TabManager
}

export function ChatView({ messages, connectionState, statusText, tabs, activeTabId, tabManager }: Props): React.JSX.Element {
  const connected = connectionState === 'connected'
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const otherTabs = tabs.filter((t) => t.id !== 'chat')

  return (
    <>
      <div className="chat-panel__messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            有什么可以帮你的？🐾
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg chat-msg--${msg.role}`}
          >
            <div className="chat-msg__bubble">
              {msg.content}
              {msg.streaming && <span className="chat-msg__cursor" />}
            </div>
          </div>
        ))}
      </div>

      {statusText && (
        <div className="chat-panel__agent-status">{statusText}</div>
      )}

      {!connected && (
        <div className="chat-panel__status-bar">
          {connectionState === 'connecting' ? '连接中...' : '已断开，正在重连...'}
        </div>
      )}

      {otherTabs.length > 0 && (
        <div className="chat-panel__sidebar">
          <div className="chat-panel__sidebar-title">其他页面</div>
          <div className="chat-panel__sidebar-list">
            {otherTabs.map((tab) => (
              <button
                key={tab.id}
                className="chat-panel__sidebar-item"
                onClick={() => tabManager.setActiveTabId(tab.id)}
              >
                <span className="chat-panel__sidebar-item-icon">{tab.id === 'notes' ? '📝' : tab.id === 'tools' ? '🔧' : '📄'}</span>
                <span className="chat-panel__sidebar-item-title">{tab.title}</span>
                <span className="chat-panel__sidebar-item-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
