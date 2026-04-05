import React, { useEffect, useState, useRef } from 'react'
import './styles.css'

interface Props {
  message: { id: number; text: string }
  duration?: number
  opacity?: number
  showTail?: boolean
  tailAlign?: 'center' | 'left' | 'right'
  streaming?: boolean
  onDismiss?: (id: number) => void
}

export function ChatBubble({
  message,
  duration = 6000,
  opacity = 1,
  showTail = true,
  tailAlign = 'center',
  streaming = false,
  onDismiss
}: Props): React.JSX.Element {
  const [hiding, setHiding] = useState(false)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // streaming 期间不启动计时器；streaming 结束后才开始倒计时
  useEffect(() => {
    if (streaming) {
      // 清除任何已有的计时器
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      if (removeTimerRef.current) { clearTimeout(removeTimerRef.current); removeTimerRef.current = null }
      setHiding(false)
      return
    }

    // 非 streaming：启动 dismiss 倒计时
    setHiding(false)
    hideTimerRef.current = setTimeout(() => {
      setHiding(true)
    }, duration)
    removeTimerRef.current = setTimeout(() => {
      dismissRef.current?.(message.id)
    }, duration + 300)

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    }
  }, [message.id, duration, streaming])

  return (
    <div
      className={`chat-bubble${hiding ? ' chat-bubble--hiding' : ''}${streaming ? ' chat-bubble--streaming' : ''}`}
      style={{ opacity }}
    >
      <span className="chat-bubble__text">{message.text || '...'}</span>
      {showTail && <div className={`chat-bubble__tail chat-bubble__tail--${tailAlign}`} />}
    </div>
  )
}
