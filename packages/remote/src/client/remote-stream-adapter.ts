import type { SessionStore, PermissionSuggestion } from '@coding-bubble/session-monitor'
import type { PermissionResult } from '@coding-bubble/stream-json'
import type { StreamEvent } from '@coding-bubble/stream-json'
import type { RemoteManager } from './remote-manager'
import type { ServerMessage, StreamEventMessage, StreamCreateResultMessage } from '../shared/protocol'

export type StreamEventHandler = (sessionId: string, event: StreamEvent) => void

interface PendingCreate {
  resolve: (sessionId: string) => void
  reject: (error: Error) => void
  cwd: string
}

export class RemoteStreamAdapter {
  private _remoteManager: RemoteManager
  private _sessionStore: SessionStore
  private _serverSessions = new Map<string, string>() // compound sessionId -> serverId
  private _serverInternalIds = new Map<string, string>() // compound sessionId -> server's internal sessionId
  private _pendingCreates = new Map<string, PendingCreate>() // requestId -> pending
  private _eventHandler: StreamEventHandler | null = null

  constructor(remoteManager: RemoteManager, sessionStore: SessionStore) {
    this._remoteManager = remoteManager
    this._sessionStore = sessionStore
  }

  /** Set a custom event handler to translate StreamEvents into SessionStore operations */
  setEventHandler(handler: StreamEventHandler): void {
    this._eventHandler = handler
  }

  register(): void {
    this._remoteManager.onMessage((serverId, message) => {
      if (message.type === 'stream_event') {
        this._handleStreamEvent(serverId, message)
      } else if (message.type === 'stream_create_result') {
        this._handleCreateResult(serverId, message)
      }
    })
  }

  async create(serverId: string, cwd: string, sessionId?: string, options?: { bypassPermissions?: boolean }): Promise<string> {
    console.log('[remote-stream-adapter] create:', { serverId, cwd, sessionId, options })
    const requestId = `create_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    return new Promise((resolve, reject) => {
      this._pendingCreates.set(requestId, { resolve, reject, cwd })

      this._remoteManager.send(serverId, {
        type: 'stream_create',
        requestId,
        cwd,
        sessionId,
        bypassPermissions: options?.bypassPermissions,
      })

      // Timeout after 10s
      setTimeout(() => {
        if (this._pendingCreates.has(requestId)) {
          this._pendingCreates.delete(requestId)
          reject(new Error('Create session timeout'))
        }
      }, 10_000)
    })
  }

  send(serverId: string, sessionId: string, text: string): void {
    const internalId = this._serverInternalIds.get(sessionId)
    if (!internalId) return
    this._remoteManager.send(serverId, {
      type: 'stream_send',
      sessionId: internalId,
      text,
    })
  }

  interrupt(serverId: string, sessionId: string): void {
    const internalId = this._serverInternalIds.get(sessionId)
    if (!internalId) return
    this._remoteManager.send(serverId, {
      type: 'stream_interrupt',
      sessionId: internalId,
    })
  }

  async destroy(serverId: string, sessionId: string): Promise<void> {
    const internalId = this._serverInternalIds.get(sessionId)
    this._serverSessions.delete(sessionId)
    this._serverInternalIds.delete(sessionId)
    if (!internalId) return
    this._remoteManager.send(serverId, {
      type: 'stream_destroy',
      sessionId: internalId,
    })
  }

  /** Send permission approval to remote server (only WebSocket forwarding, no local state) */
  approvePermission(serverId: string, sessionId: string, requestId: string): void {
    const internalId = this._serverInternalIds.get(sessionId) ?? sessionId
    const result: PermissionResult = { behavior: 'allow', updatedInput: {} }
    this._remoteManager.send(serverId, {
      type: 'stream_permission_response',
      sessionId: internalId,
      requestId,
      result,
    })
  }

  /** Send permission denial to remote server (only WebSocket forwarding, no local state) */
  denyPermission(serverId: string, sessionId: string, requestId: string, reason?: string): void {
    const internalId = this._serverInternalIds.get(sessionId) ?? sessionId
    const result: PermissionResult = { behavior: 'deny', message: reason ?? 'Denied by user' }
    this._remoteManager.send(serverId, {
      type: 'stream_permission_response',
      sessionId: internalId,
      requestId,
      result,
    })
  }

  /** Send always-allow mode + current approval to remote server */
  alwaysAllowPermission(serverId: string, sessionId: string, requestId: string): void {
    const internalId = this._serverInternalIds.get(sessionId) ?? sessionId
    this.approvePermission(serverId, sessionId, requestId)
    this._remoteManager.send(serverId, {
      type: 'stream_set_permission_mode',
      sessionId: internalId,
      mode: 'auto',
    })
  }

  /** Send suggestion-based permission approval to remote server */
  suggestionPermission(serverId: string, sessionId: string, index: number): void {
    const internalId = this._serverInternalIds.get(sessionId) ?? sessionId
    const session = this._sessionStore.get(sessionId)
    const context = session?.phase.type === 'waitingForApproval'
      ? (session.phase as { context: { toolUseId: string; suggestions: PermissionSuggestion[] } }).context
      : undefined
    if (!context) return

    const suggestion = context.suggestions?.[index]
    if (!suggestion) return

    const result: PermissionResult = {
      behavior: 'allow',
      updatedInput: {},
      updatedPermissions: [suggestion],
    }
    this._remoteManager.send(serverId, {
      type: 'stream_permission_response',
      sessionId: internalId,
      requestId: context.toolUseId,
      result,
    })
  }

  // ── Private ──────────────────────────────────────────────

  private _handleStreamEvent(serverId: string, message: StreamEventMessage): void {
    const internalSessionId = `remote:${serverId}:${message.sessionId}`
    const event = message.event

    // Session must be created by _handleCreateResult first
    if (!this._sessionStore.get(internalSessionId)) return

    // Delegate to custom event handler if set
    if (this._eventHandler) {
      this._eventHandler(internalSessionId, event)
      return
    }
  }

  private _handleCreateResult(serverId: string, message: StreamCreateResultMessage): void {
    const pending = this._pendingCreates.get(message.requestId)
    if (!pending) return

    this._pendingCreates.delete(message.requestId)

    if (message.error || !message.sessionId) {
      pending.reject(new Error(message.error ?? 'Failed to create session'))
      return
    }

    // Extract directory name from cwd as project name
    const projectName = pending.cwd.split('/').filter(Boolean).pop() ?? 'remote'
    const internalSessionId = `remote:${serverId}:${message.sessionId}`
    this._sessionStore.createStreamSession(internalSessionId, projectName)
    const session = this._sessionStore.get(internalSessionId)
    if (session) {
      (session as { source: string }).source = 'remote-stream'
    }
    this._serverSessions.set(internalSessionId, serverId)
    this._serverInternalIds.set(internalSessionId, message.sessionId)
    pending.resolve(internalSessionId)
  }
}
