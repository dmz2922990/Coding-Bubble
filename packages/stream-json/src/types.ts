// ═─ Stream Event Types ──────────────────────────────────────────

export type StreamEventType =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'thinking'
  | 'permission_request'
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
