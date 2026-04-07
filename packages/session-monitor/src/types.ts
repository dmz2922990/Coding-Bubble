// ═─ Session Phase State Machine ──────────────────────────────

export type SessionPhaseType =
  | 'idle'
  | 'processing'
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
  | { type: 'processing' }
  | { type: 'waitingForInput' }
  | { type: 'waitingForApproval', context: PermissionContext }
  | { type: 'compacting' }
  | { type: 'ended' }

export const VALID_TRANSITIONS: Record<SessionPhaseType, SessionPhaseType[]> = {
  idle: ['processing', 'waitingForApproval', 'compacting'],
  processing: ['waitingForInput', 'waitingForApproval', 'compacting', 'idle'],
  waitingForInput: ['processing', 'idle', 'compacting'],
  waitingForApproval: ['processing', 'idle', 'waitingForInput'],
  compacting: ['processing', 'idle', 'waitingForInput'],
  ended: []
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
