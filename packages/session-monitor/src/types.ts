// ═─ Session Phase State Machine ──────────────────────────────

export interface SkillCommand {
  name: string
  description: string
  argumentHint: string
}

export interface InitMetadata {
  skills: string[]
  slashCommands: string[]
  commands?: SkillCommand[]
}

export type SessionPhaseType =
  | 'idle'
  | 'thinking'
  | 'processing'
  | 'juggling'
  | 'done'
  | 'error'
  | 'waitingForInput'
  | 'waitingForApproval'
  | 'compacting'
  | 'ended'

// ═─ Permission Suggestions ─────────────────────────────────

export interface AddRulesSuggestion {
  type: 'addRules'
  destination: string
  behavior: string
  rules: Array<{ toolName: string; ruleContent: string }>
  /** Flat format from Claude Code (single rule) */
  toolName?: string
  ruleContent?: string
}

export interface SetModeSuggestion {
  type: 'setMode'
  mode: string
  destination: string
}

export interface AddDirectoriesSuggestion {
  type: 'addDirectories'
  directories: string[]
  destination: string
}

export type PermissionSuggestion =
  | AddRulesSuggestion
  | SetModeSuggestion
  | AddDirectoriesSuggestion
  | (Record<string, unknown> & { type: string })

/** Merge multiple addRules suggestions into one (e.g. piped commands a && b) */
export function mergeSuggestions(raw: PermissionSuggestion[]): PermissionSuggestion[] {
  const addRulesItems = raw.filter(s => s.type === 'addRules') as AddRulesSuggestion[]
  if (addRulesItems.length <= 1) return raw

  const merged: AddRulesSuggestion = {
    type: 'addRules',
    destination: addRulesItems[0].destination || 'localSettings',
    behavior: addRulesItems[0].behavior || 'allow',
    rules: addRulesItems.flatMap(s =>
      Array.isArray(s.rules) && s.rules.length > 0
        ? s.rules
        : [{ toolName: (s as unknown as Record<string, unknown>).toolName as string ?? '', ruleContent: (s as unknown as Record<string, unknown>).ruleContent as string ?? '' }]
    ),
  }

  return [...raw.filter(s => s.type !== 'addRules'), merged]
}

export interface PermissionContext {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown> | null
  receivedAt: number
  suggestions?: PermissionSuggestion[]
}

export type SessionPhase =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'processing' }
  | { type: 'juggling' }
  | { type: 'done' }
  | { type: 'error' }
  | { type: 'waitingForInput' }
  | { type: 'waitingForApproval', context: PermissionContext }
  | { type: 'compacting' }
  | { type: 'ended' }

export const VALID_TRANSITIONS: Record<SessionPhaseType, SessionPhaseType[]> = {
  idle: ['thinking', 'processing', 'juggling', 'waitingForApproval', 'waitingForInput', 'done', 'compacting'],
  thinking: ['processing', 'juggling', 'done', 'error', 'waitingForApproval', 'compacting'],
  processing: ['thinking', 'juggling', 'done', 'error', 'waitingForInput', 'waitingForApproval', 'compacting'],
  juggling: ['processing', 'done', 'error', 'waitingForInput', 'waitingForApproval', 'compacting'],
  done: ['idle', 'thinking', 'waitingForInput'],
  error: ['idle', 'thinking', 'processing', 'done', 'waitingForApproval'],
  waitingForInput: ['thinking', 'processing', 'idle', 'done', 'compacting'],
  waitingForApproval: ['processing', 'idle', 'waitingForInput', 'done'],
  compacting: ['processing', 'idle', 'waitingForInput', 'done'],
  ended: []
}

export const STATE_PRIORITY: Record<SessionPhaseType, number> = {
  error: 8,
  waitingForApproval: 7,
  done: 6,
  waitingForInput: 5,
  compacting: 4,
  juggling: 4,
  processing: 3,
  thinking: 2,
  idle: 1,
  ended: 0
}

export const ONESHOT_TIMEOUTS: Partial<Record<SessionPhaseType, number>> = {
  done: 10_000,
  thinking: 600_000,
  processing: 600_000,
  juggling: 600_000,
}

// ═─ Chat History Items ──────────────────────────────────────

export type ToolStatus = 'running' | 'success' | 'error' | 'interrupted' | 'waitingForApproval'

export interface SubToolItem {
  id: string
  name: string
  input: Record<string, string>
  status: ToolStatus
  result?: string
}

export interface ToolCallItem {
  name: string
  input: Record<string, string>
  status: ToolStatus
  result?: string
  structuredResult?: unknown
  subTools?: SubToolItem[]
}

export type TaskNotificationPhase = 'started' | 'running' | 'completed' | 'failed'

export type ChatHistoryItem =
  | { id: string; type: 'user'; content: string; timestamp: number }
  | { id: string; type: 'assistant'; content: string; timestamp: number; streaming?: boolean }
  | { id: string; type: 'toolCall'; tool: ToolCallItem; timestamp: number; elapsedSeconds?: number }
  | { id: string; type: 'thinking'; content: string; timestamp: number }
  | { id: string; type: 'interrupted'; timestamp: number }
  | { id: string; type: 'system'; content: string; timestamp: number }
  | { id: string; type: 'systemStatus'; statusKind: string; content: string; timestamp: number }
  | { id: string; type: 'taskNotification'; taskId: string; phase: TaskNotificationPhase; description: string; progress: string[]; summary?: string; timestamp: number }
  | { id: string; type: 'resultSummary'; durationMs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; interrupted?: boolean; timestamp: number }

// ═─ Session History ─────────────────────────────────────────

export interface SessionHistoryEntry {
  sessionId: string
  projectName: string
  cwd: string
  source: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'
  summary: string
  closedAt: number
  createdAt: number
}

// ═─ Session State ───────────────────────────────────────────

export interface SessionState {
  sessionId: string
  cwd: string
  projectName: string
  phase: SessionPhase
  chatItems: ChatHistoryItem[]
  source: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'
  pid?: number
  tty?: string
  lastActivity: number
  createdAt: number
  permissionMode: string
  initMetadata?: InitMetadata
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
  updatedPermissions?: PermissionSuggestion[]
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

export interface NotificationAutoCloseConfig {
  approval: number
  error: number
  input: number
  done: number
  quickApproval?: boolean
}

export interface BubbleNotification {
  sessionId: string
  projectName: string
  type: NotificationType
  toolName?: string
  timestamp: number
  autoCloseMs: number
  isAskUserQuestion?: boolean
  source?: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'
}
