import React, { useRef, useCallback, useEffect } from 'react'
import { useClawSocket } from '../../hooks/useClawSocket'
import './styles.css'

export function ChatPanel(): React.JSX.Element {
  const { connectionState, messages, statusText } = useClawSocket()
  const connected = connectionState === 'connected'
  const listRef = useRef<HTMLDivElement>(null)

  // 消息列表自动滚到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleClose = useCallback(() => {
    window.electronAPI.closeWindow()
  }, [])

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <div className="chat-panel__title">对话</div>
        <button className="chat-panel__close" onClick={handleClose} title="关闭">×</button>
      </div>

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
    </div>
  )
}
