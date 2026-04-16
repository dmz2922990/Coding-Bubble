import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { TabItem, SessionPhaseType } from './types'
import './TabBar.css'

const TAB_PHASE_COLORS: Record<SessionPhaseType, string> = {
  idle: '#888',
  thinking: '#ab47bc',
  processing: '#2196f3',
  juggling: '#ab47bc',
  done: '#66bb6a',
  error: '#f44336',
  waitingForInput: '#78909c',
  waitingForApproval: '#ff9800',
  compacting: '#2196f3',
  ended: '#9e9e9e'
}

function getTabStyle(tab: TabItem): React.CSSProperties {
  if (!tab.phase || tab.phase === 'idle' || tab.phase === 'ended') {
    return { '--tab-indicator-color': 'transparent' } as React.CSSProperties
  }
  return { '--tab-indicator-color': TAB_PHASE_COLORS[tab.phase] ?? '#888' } as React.CSSProperties
}

interface Props {
  tabs: TabItem[]
  chatTab: TabItem | undefined
  activeTabId: string
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
}

export function TabBar({ tabs, chatTab, activeTabId, onTabSelect, onTabClose }: Props): React.JSX.Element {
  const [showScrollBtns, setShowScrollBtns] = useState({ left: false, right: false })
  const tabsRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const LONG_PRESS_DURATION = 100

  const updateScrollButtons = useCallback(() => {
    const el = tabsRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    const canScrollLeft = el.scrollLeft > 2
    const canScrollRight = Math.ceil(el.scrollLeft) < Math.floor(maxScroll)
    setShowScrollBtns({ left: canScrollLeft, right: canScrollRight })
  }, [])

  useEffect(() => {
    updateScrollButtons()
    const el = tabsRef.current
    el?.addEventListener('scroll', updateScrollButtons)
    window.addEventListener('resize', updateScrollButtons)
    const observer = new ResizeObserver(updateScrollButtons)
    if (el) observer.observe(el)
    return () => {
      el?.removeEventListener('scroll', updateScrollButtons)
      window.removeEventListener('resize', updateScrollButtons)
      observer.disconnect()
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [updateScrollButtons])

  useEffect(() => {
    updateScrollButtons()
  }, [activeTabId, updateScrollButtons])

  // Long press handlers for window dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left mouse button
    if (e.button !== 0) return

    isDraggingRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      isDraggingRef.current = true
      window.electronAPI.dragStart()
    }, LONG_PRESS_DURATION)
  }, [])

  const handleMouseMove = useCallback(() => {
    if (isDraggingRef.current) {
      window.electronAPI.dragMove()
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isDraggingRef.current) {
      window.electronAPI.dragEnd()
      isDraggingRef.current = false
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isDraggingRef.current) {
      window.electronAPI.dragEnd()
      isDraggingRef.current = false
    }
  }, [])

  const handleScroll = useCallback((direction: 'left' | 'right') => {
    const el = tabsRef.current
    if (!el) return
    if (direction === 'left') {
      el.scrollBy({ left: -120, behavior: 'smooth' })
    } else {
      el.scrollBy({ left: 120, behavior: 'smooth' })
    }
    setTimeout(() => updateScrollButtons(), 400)
  }, [updateScrollButtons])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = tabsRef.current
    if (!el) return
    e.preventDefault()
    el.scrollBy({ left: e.deltaY > 0 ? 120 : -120, behavior: 'smooth' })
    setTimeout(() => updateScrollButtons(), 400)
  }, [updateScrollButtons])

  const handleTabClick = (id: string) => {
    onTabSelect(id)
    requestAnimationFrame(() => updateScrollButtons())
  }

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onTabClose(id)
  }

  const scrollableTabs = tabs.filter((t) => t.id !== 'chat')

  return (
    <div
      className="tab-bar-wrapper"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {chatTab && !scrollableTabs.length ? (
        <button
          className={`tab-bar__tab${activeTabId === chatTab.id ? ' tab-bar__tab--active' : ''}`}
          onClick={() => handleTabClick(chatTab.id)}
        >
          <span className="tab-bar__title">{chatTab.title}</span>
        </button>
      ) : (
        <>
          {chatTab && (
            <button
              className={`tab-bar__tab${activeTabId === chatTab.id ? ' tab-bar__tab--active' : ''}`}
              onClick={() => handleTabClick(chatTab.id)}
            >
              <span className="tab-bar__title">{chatTab.title}</span>
            </button>
          )}
          {scrollableTabs.length > 0 && (
            <>
              {showScrollBtns.left && (
                <button
                  className="tab-bar__scroll-btn"
                  onClick={() => handleScroll('left')}
                  title="向左"
                >
                  ‹
                </button>
              )}
              <div className="tab-bar" ref={tabsRef} onScroll={updateScrollButtons} onWheel={handleWheel}>
                {scrollableTabs.map((tab) => {
                  const tabSource = tab.source ?? 'hook'
                  const isStream = tabSource === 'stream' || tabSource === 'remote-stream'
                  const isRemote = tabSource.startsWith('remote')
                  return (
                    <button
                      key={tab.id}
                      className={`tab-bar__tab${activeTabId === tab.id ? ' tab-bar__tab--active' : ''}`}
                      onClick={() => handleTabClick(tab.id)}
                      title={tab.title}
                      style={getTabStyle(tab)}
                    >
                      <span className={`tab-bar__source-indicator${isStream ? ' tab-bar__source-indicator--stream' : ''}${isRemote ? ' tab-bar__source-indicator--remote' : ''}`} />
                      <span className="tab-bar__title">{tab.title}</span>
                      {tab.closable !== false && (
                        <button
                          className="tab-bar__close"
                          onClick={(e) => handleCloseClick(e, tab.id)}
                          title="关闭"
                        >
                          ×
                        </button>
                      )}
                    </button>
                  )
                })}
              </div>
              {showScrollBtns.right && (
                <button
                  className="tab-bar__scroll-btn"
                  onClick={() => handleScroll('right')}
                  title="向右"
                >
                  ›
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
