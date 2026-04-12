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
    if (!trimmed) return
    setText('')
    onSend(trimmed)
  }, [text, onSend])

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

  // Auto-focus on mount and when transitioning to idle
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

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
          rows={1}
        />
      </div>
      <div className="message-input__line" />
    </div>
  )
}
