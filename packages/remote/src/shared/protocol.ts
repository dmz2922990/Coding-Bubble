import type { HookEvent, HookResponse } from '@coding-bubble/session-monitor'
import type { StreamEvent, PermissionResult } from '@coding-bubble/stream-json'

// ═─ Message Types ─────────────────────────────────────────────

// ── Authentication ────────────────────────────────────────────

export interface AuthMessage {
  type: 'auth'
  token: string
}

export interface AuthResultMessage {
  type: 'auth_result'
  success: boolean
  error?: string
}

// ── Server Info ───────────────────────────────────────────────

export interface ServerInfoMessage {
  type: 'server_info'
  hostname: string
  platform: string
  pid: number
  version?: string
}

// ── Hook Events (Server → Client) ─────────────────────────────

export interface HookEventMessage {
  type: 'hook_event'
  sessionId: string
  event: HookEvent
}

// ── Hook Permission Response (Client → Server) ────────────────

export interface HookPermissionResponseMessage {
  type: 'hook_permission_response'
  sessionId: string
  toolUseId: string
  response: HookResponse
}

// ── Hook Session Close (Client → Server) ──────────────────────

export interface HookSessionCloseMessage {
  type: 'hook_session_close'
  sessionId: string
}

// ── Stream Create (Client → Server) ───────────────────────────

export interface StreamCreateMessage {
  type: 'stream_create'
  requestId: string
  cwd: string
  sessionId?: string
  model?: string
  permissionMode?: string
  bypassPermissions?: boolean
}

export interface StreamCreateResultMessage {
  type: 'stream_create_result'
  requestId: string
  sessionId?: string
  error?: string
}

// ── Stream Send (Client → Server) ─────────────────────────────

export interface StreamSendMessage {
  type: 'stream_send'
  sessionId: string
  text: string
}

// ── Stream Interrupt (Client → Server) ────────────────────────

export interface StreamInterruptMessage {
  type: 'stream_interrupt'
  sessionId: string
}

// ── Stream Destroy (Client → Server) ──────────────────────────

export interface StreamDestroyMessage {
  type: 'stream_destroy'
  sessionId: string
}

// ── Stream Permission Response (Client → Server) ──────────────

export interface StreamPermissionResponseMessage {
  type: 'stream_permission_response'
  sessionId: string
  requestId: string
  result: PermissionResult
}

// ── Stream Event (Server → Client) ────────────────────────────

export interface StreamEventMessage {
  type: 'stream_event'
  sessionId: string
  event: StreamEvent
}

// ── Directory Listing (Client ↔ Server) ───────────────────────

export interface ListDirectoryMessage {
  type: 'list_directory'
  requestId: string
  path?: string
}

export interface DirEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

export interface ListDirectoryResultMessage {
  type: 'list_directory_result'
  requestId: string
  entries: DirEntry[]
  error?: string
}

// ── Stream Set Permission Mode (Client → Server) ──────────────

export interface StreamSetPermissionModeMessage {
  type: 'stream_set_permission_mode'
  sessionId: string
  mode: string
}

// ── Error (Server → Client) ───────────────────────────────────

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
  sessionId?: string
}

// ── Remote Server Update (Client ↔ Server) ───────────────────

export interface UpdateOfferMessage {
  type: 'update_offer'
  version: string
  size: number
  checksum: string
}

export interface UpdateAcceptMessage {
  type: 'update_accept'
}

export interface UpdateRejectMessage {
  type: 'update_reject'
  reason: string
}

export interface UpdateChunkMessage {
  type: 'update_chunk'
  sequence: number
  data: string // base64 encoded
}

export interface UpdateCompleteMessage {
  type: 'update_complete'
}

export interface UpdateResultMessage {
  type: 'update_result'
  success: boolean
  error?: string
}

// ═─ Discriminated Union ───────────────────────────────────────

/** All messages that can be sent from client to server */
export type ClientMessage =
  | AuthMessage
  | HookPermissionResponseMessage
  | HookSessionCloseMessage
  | StreamCreateMessage
  | StreamSendMessage
  | StreamInterruptMessage
  | StreamDestroyMessage
  | StreamPermissionResponseMessage
  | StreamSetPermissionModeMessage
  | ListDirectoryMessage
  | UpdateOfferMessage
  | UpdateChunkMessage
  | UpdateCompleteMessage

/** All messages that can be sent from server to client */
export type ServerMessage =
  | AuthResultMessage
  | ServerInfoMessage
  | HookEventMessage
  | StreamCreateResultMessage
  | StreamEventMessage
  | ListDirectoryResultMessage
  | ErrorMessage
  | UpdateAcceptMessage
  | UpdateRejectMessage
  | UpdateResultMessage

/** Union of all message types */
export type RemoteMessage = ClientMessage | ServerMessage
