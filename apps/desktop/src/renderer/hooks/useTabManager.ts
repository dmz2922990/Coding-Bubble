import { useState, useCallback, useMemo } from 'react'
import type { TabItem, TabManager } from '../components/ChatPanel/types'

export function useTabManager(initialTabs: TabItem[]): TabManager {
  const [tabs, setTabs] = useState<TabItem[]>(initialTabs)
  const [activeTabId, setActiveTabId] = useState<string>(
    () => initialTabs[0]?.id ?? ''
  )

  const addTab = useCallback((tab: TabItem) => {
    setTabs((prev) => {
      const existing = prev.findIndex((t) => t.id === tab.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = tab
        return next
      }
      return [...prev, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const removeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const target = prev.find((t) => t.id === id)
      if (!target || target.closable === false) return prev

      const next = prev.filter((t) => t.id !== id)
      if (id === activeTabId && next.length > 0) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeTabId])

  return useMemo(
    () => ({ tabs, addTab, removeTab, setActiveTabId, activeTabId }),
    [tabs, addTab, removeTab, activeTabId]
  )
}
