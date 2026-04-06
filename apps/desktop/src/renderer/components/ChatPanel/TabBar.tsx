import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { TabItem } from './types'
import './TabBar.css'

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

  const updateScrollButtons = useCallback(() => {
    const el = tabsRef.current
    if (!el) return
    const canScrollLeft = el.scrollLeft > 2
    const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
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
    }
  }, [updateScrollButtons])

  const handleScroll = useCallback((direction: 'left' | 'right') => {
    const el = tabsRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' })
  }, [])

  const handleTabClick = (id: string) => {
    onTabSelect(id)
  }

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onTabClose(id)
  }

  const scrollableTabs = tabs.filter((t) => t.id !== 'chat')
  const hasScroll = scrollableTabs.length > 0 &&
    (showScrollBtns.left || showScrollBtns.right)

  return (
    <div className="tab-bar-wrapper">
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
              {!hasScroll && (
                <div className="tab-bar" ref={tabsRef}>
                  {scrollableTabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={`tab-bar__tab${activeTabId === tab.id ? ' tab-bar__tab--active' : ''}`}
                      onClick={() => handleTabClick(tab.id)}
                      title={tab.title}
                    >
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
                  ))}
                </div>
              )}
              {hasScroll && (
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
                  <div className="tab-bar" ref={tabsRef} onScroll={updateScrollButtons}>
                    {scrollableTabs.map((tab) => (
                      <button
                        key={tab.id}
                        className={`tab-bar__tab${activeTabId === tab.id ? ' tab-bar__tab--active' : ''}`}
                        onClick={() => handleTabClick(tab.id)}
                        title={tab.title}
                      >
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
                    ))}
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
        </>
      )}
    </div>
  )
}
