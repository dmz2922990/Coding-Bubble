import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { InitMetadata, SkillCommand } from './types'
import './styles.css'

const BUSY_PHASES = new Set(['thinking', 'processing', 'compacting'])
const MAX_VISIBLE_SUGGESTIONS = 8

interface SuggestionItem {
  name: string
  description: string
}

interface Props {
  onSend: (text: string) => void
  phase: string
  initMetadata?: InitMetadata
}

function buildSuggestions(initMetadata?: InitMetadata): SuggestionItem[] {
  if (!initMetadata) return []

  // Prefer rich commands from initialize control response
  if (initMetadata.commands?.length) {
    return initMetadata.commands.map(c => ({
      name: c.name.startsWith('/') ? c.name : `/${c.name}`,
      description: c.description ?? '',
    }))
  }

  // Fallback to flat skills + slashCommands from system/init
  const all = [
    ...initMetadata.skills ?? [],
    ...initMetadata.slashCommands ?? [],
  ]
  return [...new Set(all)].sort().map(name => ({
    name: name.startsWith('/') ? name : `/${name}`,
    description: '',
  }))
}

export function MessageInput({ onSend, phase, initMetadata }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isBusy = BUSY_PHASES.has(phase)

  const suggestions = useMemo(() => buildSuggestions(initMetadata), [initMetadata])

  const getQuery = useCallback((value: string, cursorPos: number): string | null => {
    const textBeforeCursor = value.slice(0, cursorPos)
    const match = textBeforeCursor.match(/(?:^|\s)(\/\S*)$/)
    if (!match) return null
    const slashPos = textBeforeCursor.lastIndexOf('/')
    if (slashPos === -1) return null
    if (slashPos > 0 && textBeforeCursor[slashPos - 1] !== ' ') return null
    return textBeforeCursor.slice(slashPos + 1)
  }, [])

  const currentQuery = useMemo(() => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0
    return getQuery(text, cursorPos)
  }, [text, getQuery])

  const filteredSuggestions = useMemo(() => {
    if (currentQuery === null) return []
    const q = currentQuery.toLowerCase()
    if (q === '') return suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS)
    return suggestions
      .filter(item => {
        const name = item.name.slice(1).toLowerCase()
        return name.startsWith(q)
      })
      .slice(0, MAX_VISIBLE_SUGGESTIONS)
  }, [currentQuery, suggestions])

  useEffect(() => {
    const shouldShow = filteredSuggestions.length > 0 && currentQuery !== null
    setShowSuggestions(shouldShow)
    if (shouldShow) setHighlightIndex(0)
  }, [filteredSuggestions.length, currentQuery])

  const applySuggestion = useCallback((item: SuggestionItem) => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0
    const textBeforeCursor = text.slice(0, cursorPos)
    const slashPos = textBeforeCursor.lastIndexOf('/')
    if (slashPos === -1) return

    const before = text.slice(0, slashPos)
    const after = text.slice(cursorPos)
    const newText = `${before}${item.name} ${after}`

    setText(newText)
    setShowSuggestions(false)

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = before.length + item.name.length + 1
        textareaRef.current.selectionStart = newPos
        textareaRef.current.selectionEnd = newPos
        textareaRef.current.focus()
      }
    })
  }, [text])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    setShowSuggestions(false)
    onSend(trimmed)
  }, [text, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex(i => (i + 1) % filteredSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex(i => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applySuggestion(filteredSuggestions[highlightIndex]!)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSuggestions(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [showSuggestions, filteredSuggestions, highlightIndex, applySuggestion, handleSend])

  const handleSuggestionClick = useCallback((item: SuggestionItem) => {
    applySuggestion(item)
  }, [applySuggestion])

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

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
          className={`message-input__textarea${isBusy ? ' message-input__textarea--busy' : ''}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="message-input__suggestions">
            {filteredSuggestions.map((item, i) => (
              <div
                key={item.name}
                className={`message-input__suggestion${i === highlightIndex ? ' message-input__suggestion--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSuggestionClick(item)
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="message-input__suggestion-name">{item.name}</span>
                {item.description && (
                  <span className="message-input__suggestion-desc">{item.description}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="message-input__line" />
    </div>
  )
}
