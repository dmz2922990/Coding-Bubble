/** Represents a single tab in the panel */
export interface TabItem {
  id: string
  title: string
  closable?: boolean
  content: React.ReactNode
  phase?: SessionPhaseType
  source?: 'hook' | 'stream'
}

/** Functions exposed by the tab manager */
export interface TabManager {
  addTab: (tab: TabItem) => void
  removeTab: (id: string) => void
  setActiveTabId: (id: string) => void
  tabs: TabItem[]
  activeTabId: string
}

/** Session phase type for UI rendering */
export type SessionPhaseType =
  | 'idle'
  | 'thinking'
  | 'processing'
  | 'done'
  | 'error'
  | 'waitingForInput'
  | 'waitingForApproval'
  | 'compacting'
  | 'ended'

/** Status indicator for a session */
export interface SessionInfo {
  sessionId: string
  projectName: string
  cwd: string
  phase: SessionPhaseType
  source?: 'hook' | 'stream'
  lastActivity: number
  toolName?: string
  toolInput?: Record<string, unknown> | null
}

/** Chat history item rendered in a session tab */
export interface ChatItem {
  id: string
  type: 'user' | 'assistant' | 'toolCall' | 'thinking' | 'interrupted' | 'system' | 'systemStatus' | 'taskNotification' | 'resultSummary'
  content?: string
  tool?: {
    name: string
    input: Record<string, string>
    status: 'running' | 'success' | 'error' | 'interrupted' | 'waitingForApproval'
    result?: string
    subTools?: Array<{
      id: string
      name: string
      input: Record<string, string>
      status: 'running' | 'success' | 'error' | 'interrupted' | 'waitingForApproval'
      result?: string
    }>
  }
  timestamp: number
  streaming?: boolean
  elapsedSeconds?: number
  toolUseId?: string
  statusKind?: string
  taskId?: string
  taskPhase?: 'started' | 'running' | 'completed' | 'failed'
  taskDescription?: string
  taskProgress?: string[]
  taskSummary?: string
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  interrupted?: boolean
}
