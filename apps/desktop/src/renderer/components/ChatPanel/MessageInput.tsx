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

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  // Auto-focus when not busy
  useEffect(() => {
    if (!isBusy && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isBusy])

  return (
    <div className="message-input">
      <div className="message-input__line" />
      <div className="message-input__wrapper">
        <span className="message-input__prompt">❯</span>
        <textarea
          ref={textareaRef}
          className="message-input__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? '等待回复中...' : ''}
          disabled={isBusy}
          rows={1}
        />
      </div>
      <div className="message-input__line" />
    </div>
  )
}
