import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChatBubble } from '../ChatBubble'
import { NotificationBubble } from './NotificationBubble'
import type { BubbleNotification } from './NotificationBubble'
import bubbleIcon from '../../assets/bubble-icon.png'
import './styles.css'

/** 按时段分组的启动开场语 */
const STARTUP_GREETINGS: Record<string, string[]> = {
  morning: [
    '早～今天也一起加油 💬',
    '早安，新的一天开始啦',
    '早上好呀，今天有什么计划？',
    '早！精神怎么样？'
  ],
  afternoon: [
    '下午好呀，在忙什么呢？',
    '下午好～需要帮忙随时叫我',
    '午后时光，状态怎么样？',
    '下午好，我在呢 💬'
  ],
  evening: [
    '晚上好～有什么需要帮忙的吗',
    '晚上好呀，今天辛苦了',
    '晚上好，还在忙吗？',
    '嗨～晚上好 💬'
  ],
  latenight: [
    '这么晚了，注意休息哦 🌙',
    '夜深了，别太累了',
    '还没睡呀，我陪着你 🌙',
    '深夜了，早点休息哦'
  ]
}

function getStartupGreeting(): string {
  const hour = new Date().getHours()
  let period: string
  if (hour >= 6 && hour < 12) period = 'morning'
  else if (hour >= 12 && hour < 18) period = 'afternoon'
  else if (hour >= 18 && hour < 23) period = 'evening'
  else period = 'latenight'
  const pool = STARTUP_GREETINGS[period]
  return pool[Math.floor(Math.random() * pool.length)]
}

const MAX_BUBBLES = 3

function getBubbleOpacities(count: number): number[] {
  if (count <= 1) return [1.0]
  if (count === 2) return [0.6, 1.0]
  return [0.4, 0.7, 1.0]
}

function calcBubbleDuration(text: string): number {
  return Math.max(5000, Math.min(15000, 5000 + text.length * 50))
}

const DISMISS_COOLDOWN = 3 * 60_000

const CLICK_PHRASES = [
  '在呢～',
  '有什么需要帮忙的吗？',
  '今天怎么样？',
  '嗨～',
  '我在这里 💬',
  '要不要聊聊天？',
  '你好呀～',
  '陪着你呢'
]

interface BubbleItem {
  id: number
  text: string
}

export function FloatingBall(): React.JSX.Element {
  const [bubbles, setBubbles] = useState<BubbleItem[]>([])
  const [notificationVisible, setNotificationVisible] = useState(false)
  const [notifications, setNotifications] = useState<BubbleNotification[]>([])
  const [quickApproval, setQuickApproval] = useState(true)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const [displayState, setDisplayState] = useState<string | null>(null)
  const movedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const bubbleIdRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const bubbleDismissedAtRef = useRef(0)
  const bubbleDismissedRef = useRef(false)

  // Keep ref in sync for IPC callback access
  useEffect(() => {
    bubbleDismissedRef.current = bubbleDismissed
  }, [bubbleDismissed])

  const showBadge = bubbleDismissed && notifications.some(n => n.type === 'approval')

  const pushBubble = useCallback((text: string) => {
    bubbleIdRef.current += 1
    const newBubble: BubbleItem = { id: bubbleIdRef.current, text }
    setBubbles((prev) => {
      const next = [...prev, newBubble]
      return next.length > MAX_BUBBLES ? next.slice(-MAX_BUBBLES) : next
    })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      pushBubble(getStartupGreeting())
    }, 800)
    return () => clearTimeout(timer)
  }, [pushBubble])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const handleSingleClick = useCallback(() => {
    const text = CLICK_PHRASES[Math.floor(Math.random() * CLICK_PHRASES.length)]
    pushBubble(text)
  }, [pushBubble])

  const handleBubbleDismiss = useCallback((id: number) => {
    bubbleDismissedAtRef.current = Date.now()
    setBubbles((prev) => prev.filter((b) => b.id !== id))
  }, [])

  // Subscribe to notification bubble IPC events
  useEffect(() => {
    const cleanupShow = window.electronAPI.onBubbleShow((_event, data, qa) => {
      setNotifications(data as BubbleNotification[])
      if (qa !== undefined) setQuickApproval(qa)
      if (!bubbleDismissedRef.current) {
        setNotificationVisible(true)
      }
    })
    const cleanupHide = window.electronAPI.onBubbleHide(() => {
      setNotificationVisible(false)
      setBubbleDismissed(false)
    })
    const cleanupStatus = window.electronAPI.onBubbleStatus((_event, state) => {
      setDisplayState(state)
    })
    return () => {
      cleanupShow()
      cleanupHide()
      cleanupStatus()
    }
  }, [])

  const handleNotificationRowClick = useCallback((sessionId: string) => {
    window.electronAPI.navigateToSession(sessionId)
  }, [])

  const handleNotificationDismiss = useCallback((sessionId: string) => {
    setNotifications(prev => prev.filter(n => n.sessionId !== sessionId))
    window.electronAPI.dismissNotification(sessionId)
  }, [])

  const handleQuickApprove = useCallback((sessionId: string, source?: string) => {
    setNotifications(prev => prev.filter(n => n.sessionId !== sessionId))
    window.electronAPI.quickApprove(sessionId, source)
  }, [])

  const handleMouseEnter = useCallback(() => {
    window.electronAPI.setIgnoreMouseEvents(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (!isDraggingRef.current) {
      window.electronAPI.setIgnoreMouseEvents(true)
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()

      movedRef.current = false
      isDraggingRef.current = true
      window.electronAPI.dragStart()
      window.electronAPI.holdClickable()

      const onMove = (): void => {
        movedRef.current = true
        window.electronAPI.dragMove()
      }

      const onUp = (ev: MouseEvent): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)

        window.electronAPI.dragEnd()
        isDraggingRef.current = false

        const rect = ballRef.current?.getBoundingClientRect()
        if (rect) {
          const isOver =
            ev.clientX >= rect.left &&
            ev.clientX <= rect.right &&
            ev.clientY >= rect.top &&
            ev.clientY <= rect.bottom
          if (!isOver) {
            window.electronAPI.setIgnoreMouseEvents(true)
          }
        }

        if (!movedRef.current) {
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
            clickTimerRef.current = null
            window.electronAPI.openPanel()
          } else {
            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null
              handleSingleClick()
            }, 250)
          }
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [handleSingleClick]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.electronAPI.showContextMenu()
  }, [])

  const opacities = getBubbleOpacities(bubbles.length)

  return (
    <div className="ball-root">
      <div className="bubble-area">
        {bubbles.map((b, i) => (
          <ChatBubble
            key={b.id}
            message={b}
            duration={calcBubbleDuration(b.text)}
            opacity={opacities[i]}
            showTail={i === bubbles.length - 1}
            tailAlign="center"
            onDismiss={handleBubbleDismiss}
          />
        ))}
      </div>
      <div className="bottom-section">
        <div className="ball-container">
          <NotificationBubble
            notifications={notifications}
            visible={notificationVisible}
            quickApproval={quickApproval}
            onRowClick={handleNotificationRowClick}
            onDismissSession={handleNotificationDismiss}
            onQuickApprove={handleQuickApprove}
          />
          <div
            ref={ballRef}
            className="ball"
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            title="Coding-bubble 💬"
          >
            <img className="ball__icon" src={bubbleIcon} alt="bubble" draggable={false} />
          </div>
          {showBadge && <span className="ball__badge" />}
          {displayState && <span className={`ball__status-dot ball__status-dot--${displayState}`} />}
        </div>
      </div>
    </div>
  )
}
