// ═─ Stream Event Types ──────────────────────────────────────────

export type StreamEventType =
  | 'text'
  | 'text_delta'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'thinking'
  | 'permission_request'
  | 'session_state'
  | 'tool_progress'
  | 'tool_summary'
  | 'rate_limit'
  | 'system_status'
  | 'error'
  | 'exit'

export interface StreamEvent {
  type: StreamEventType
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  sessionId?: string
  requestId?: string
  done?: boolean
  error?: Error
  exitCode?: number | null
  signal?: string | null
  inputTokens?: number
  outputTokens?: number
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
  message?: string
}

// ═─ Session Metadata ──────────────────────────────────────────

export interface StreamSessionMeta {
  claudeSessionId: string
  cwd: string
  createdAt: number
}
