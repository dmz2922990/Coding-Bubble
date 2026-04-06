import React, { useRef, useCallback, useEffect } from 'react'
import type { ConnectionState, ChatMessage } from '../../hooks/useClawSocket'
import './styles.css'

interface Props {
  messages: ChatMessage[]
  connectionState: ConnectionState
  statusText: string
}

export function ChatView({ messages, connectionState, statusText }: Props): React.JSX.Element {
  const connected = connectionState === 'connected'
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

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
    </>
  )
}
