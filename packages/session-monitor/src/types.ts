// ═─ Session Phase State Machine ──────────────────────────────

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

export interface PermissionContext {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown> | null
  receivedAt: number
}

export type SessionPhase =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'processing' }
  | { type: 'done' }
  | { type: 'error' }
  | { type: 'waitingForInput' }
  | { type: 'waitingForApproval', context: PermissionContext }
  | { type: 'compacting' }
  | { type: 'ended' }

export const VALID_TRANSITIONS: Record<SessionPhaseType, SessionPhaseType[]> = {
  idle: ['thinking', 'processing', 'waitingForApproval', 'compacting'],
  thinking: ['processing', 'done', 'error', 'waitingForApproval', 'compacting'],
  processing: ['thinking', 'done', 'error', 'waitingForInput', 'waitingForApproval', 'compacting'],
  done: ['idle', 'thinking'],
  error: ['idle', 'thinking'],
  waitingForInput: ['thinking', 'processing', 'idle', 'compacting'],
  waitingForApproval: ['processing', 'idle', 'waitingForInput'],
  compacting: ['processing', 'idle', 'waitingForInput'],
  ended: []
}

export const STATE_PRIORITY: Record<SessionPhaseType, number> = {
  error: 8,
  waitingForApproval: 7,
  done: 6,
  waitingForInput: 5,
  compacting: 4,
  processing: 3,
  thinking: 2,
  idle: 1,
  ended: 0
}

export const ONESHOT_TIMEOUTS: Partial<Record<SessionPhaseType, number>> = {
  done: 3000,
  error: 5000
}

// ═─ Chat History Items ──────────────────────────────────────

export type ToolStatus = 'running' | 'success' | 'error' | 'interrupted' | 'waitingForApproval'

export interface ToolCallItem {
  name: string
  input: Record<string, string>
  status: ToolStatus
  result?: string
  structuredResult?: unknown
}

export type ChatHistoryItem =
  | { id: string; type: 'user'; content: string; timestamp: number }
  | { id: string; type: 'assistant'; content: string; timestamp: number }
  | { id: string; type: 'toolCall'; tool: ToolCallItem; timestamp: number }
  | { id: string; type: 'thinking'; content: string; timestamp: number }
  | { id: string; type: 'interrupted'; timestamp: number }
  | { id: string; type: 'system'; content: string; timestamp: number }

// ═─ Session State ───────────────────────────────────────────

export interface SessionState {
  sessionId: string
  cwd: string
  projectName: string
  phase: SessionPhase
  chatItems: ChatHistoryItem[]
  pid?: number
  tty?: string
  lastActivity: number
  createdAt: number
  permissionMode: string
}

// ═─ Hook Events ─────────────────────────────────────────────

export interface HookEvent {
  hook_event_name: string
  session_id: string
  cwd: string
  pid?: number
  payload: Record<string, unknown>
}

export interface HookResponse {
  decision: 'allow' | 'deny'
  reason?: string | null
  updatedInput?: Record<string, unknown>
}

// ═─ Pending Permission ──────────────────────────────────────

/** Stored in SessionStore when a PermissionRequest arrives */
export interface PendingPermission {
  sessionId: string
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown> | null
  resolve: (response: HookResponse) => void
  receivedAt: number
}

// ═─ Intervention ──────────────────────────────────────────────

export type InterventionPhase = 'waitingForApproval' | 'waitingForInput'

export interface Intervention {
  sessionId: string
  projectName: string
  phase: InterventionPhase
  toolName?: string
}

// ═─ Bubble Notification ────────────────────────────────────

export type NotificationType = 'approval' | 'input' | 'done' | 'error'

export interface BubbleNotification {
  sessionId: string
  projectName: string
  type: NotificationType
  toolName?: string
  timestamp: number
  autoCloseMs: number
}
