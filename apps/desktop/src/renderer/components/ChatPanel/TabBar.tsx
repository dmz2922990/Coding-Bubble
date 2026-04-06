import React from 'react'
import type { TabItem } from './types'
import './TabBar.css'

interface Props {
  tabs: TabItem[]
  activeTabId: string
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: Props): React.JSX.Element {
  const handleTabClick = (id: string) => {
    onTabSelect(id)
  }

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onTabClose(id)
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-bar__tab${tab.id === activeTabId ? ' tab-bar__tab--active' : ''}`}
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
  )
}
