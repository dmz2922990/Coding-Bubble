import type { ReactNode } from 'react'

/** Represents a single tab in the panel */
export interface TabItem {
  /** Unique identifier (e.g., 'chat', 'notes', 'tools') */
  id: string
  /** Display title shown in the tab label */
  title: string
  /** Content to render when tab is active */
  content: ReactNode
  /** Whether to show close button. Default true. Default tab uses false. */
  closable?: boolean
}

/** Functions exposed by the tab manager */
export interface TabManager {
  /** Register a new tab. Replaces if id already exists. */
  addTab: (tab: TabItem) => void
  /** Remove a tab by id. Cannot remove tabs with closable=false. */
  removeTab: (id: string) => void
  /** Switch active tab to given id */
  setActiveTab: (id: string) => void
  /** Current registered tabs */
  tabs: TabItem[]
  /** Currently active tab id */
  activeTabId: string
}
