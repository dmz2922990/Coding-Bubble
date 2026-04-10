import React, { useState, useRef, useEffect, useCallback } from 'react'
import './styles.css'

const BUSY_PHASES = new Set(['thinking', 'processing', 'compacting'])

interface Props {
  onSend: (text: string) => void
  phase: string
}

export function MessageInput({ onSend, phase }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isBusy = BUSY_PHASES.has(phase)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    setText('')
    onSend(trimmed)
  }, [text, isBusy, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Auto-focus when not busy
  useEffect(() => {
    if (!isBusy && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isBusy])

  return (
    <div className="message-input">
      <div className="message-input__wrapper">
        <textarea
          ref={textareaRef}
          className="message-input__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? '等待回复中...' : '输入消息...'}
          disabled={isBusy}
          rows={1}
        />
        <button
          className="message-input__send-btn"
          onClick={handleSend}
          disabled={isBusy || !text.trim()}
          title="发送"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 8L14 2L10 8L14 14L2 8Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      {isBusy && (
        <div className="message-input__spinner">
          <span className="message-input__spinner-dot" />
        </div>
      )}
    </div>
  )
}
