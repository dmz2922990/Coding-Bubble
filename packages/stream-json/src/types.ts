// ═─ Stream Event Types ──────────────────────────────────────────

export interface SkillCommand {
  name: string
  description: string
  argumentHint: string
}

export interface InitMetadata {
  skills: string[]
  slashCommands: string[]
  /** Rich command details from initialize control response */
  commands?: SkillCommand[]
}

export type StreamEventType =
  | 'text'
  | 'text_delta'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'thinking'
  | 'permission_request'
  | 'session_state'
  | 'session_init'
  | 'tool_progress'
  | 'tool_summary'
  | 'rate_limit'
  | 'system_status'
  | 'task_lifecycle'
  | 'post_turn_summary'
  | 'error'
  | 'exit'

export interface StreamEvent {
  type: StreamEventType
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  parentToolUseId?: string | null
  sessionId?: string
  requestId?: string
  done?: boolean
  error?: Error
  exitCode?: number | null
  signal?: string | null
  inputTokens?: number
  outputTokens?: number
  // permission_request
  suggestions?: PermissionSuggestion[]
  // session_state
  state?: 'idle' | 'running' | 'requires_action'
  // system_status
  statusKind?: 'compacting' | 'compacted' | 'api_retry'
  errorMessage?: string
  errorStatus?: number | null
  attempt?: number
  maxRetries?: number
  delayMs?: number
  // rate_limit
  rateLimitStatus?: string
  resetsAt?: number
  // tool_progress
  elapsedSeconds?: number
  // tool_summary
  summary?: string
  // result statistics
  durationMs?: number
  durationApiMs?: number
  costUsd?: number
  // result subtype (e.g. "interrupted")
  subtype?: string
  // tool_result
  isError?: boolean
  // task_lifecycle
  taskPhase?: 'started' | 'progress' | 'completed' | 'failed'
  taskId?: string
  // post_turn_summary
  title?: string
  // session_init
  initMetadata?: InitMetadata
}

// ═─ Session Options ────────────────────────────────────────────

export interface StreamSessionOptions {
  cwd: string
  /** Claude session ID to resume, "continue" for --continue, or empty for new */
  sessionId?: string
  model?: string
  permissionMode?: string
}

// ═─ Permission Result ─────────────────────────────────────────

export interface PermissionResult {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  updatedPermissions?: PermissionSuggestion[]
  message?: string
}

// ═─ Permission Suggestion ──────────────────────────────────────────

export type PermissionSuggestion =
  | { type: 'addRules'; destination: string; behavior: string; rules: Array<{ toolName: string; ruleContent: string }>; toolName?: string; ruleContent?: string }
  | { type: 'setMode'; mode: string; destination: string }
  | { type: 'addDirectories'; directories: string[]; destination: string }
  | (Record<string, unknown> & { type: string })

// ═─ Session Metadata ──────────────────────────────────────────

export interface StreamSessionMeta {
  claudeSessionId: string
  cwd: string
  createdAt: number
}
