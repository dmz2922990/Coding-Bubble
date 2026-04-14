import type { SessionStore } from '@coding-bubble/session-monitor'
import type { StreamEvent, PermissionResult } from '@coding-bubble/stream-json'
import type { RemoteManager } from './remote-manager'
import type { ServerMessage, StreamEventMessage, StreamCreateResultMessage } from '../shared/protocol'

interface PendingStreamPermission {
  sessionId: string
  requestId: string
}

interface PendingCreate {
  resolve: (sessionId: string) => void
  reject: (error: Error) => void
  cwd: string
}

export class RemoteStreamAdapter {
  private _remoteManager: RemoteManager
  private _sessionStore: SessionStore
  private _serverSessions = new Map<string, string>() // internal sessionId -> serverId
  private _pendingPermissions = new Map<string, PendingStreamPermission>() // sessionId -> pending
  private _pendingCreates = new Map<string, PendingCreate>() // requestId -> pending

  constructor(remoteManager: RemoteManager, sessionStore: SessionStore) {
    this._remoteManager = remoteManager
    this._sessionStore = sessionStore
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

  async create(serverId: string, cwd: string, sessionId?: string): Promise<string> {
    const requestId = `create_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    return new Promise((resolve, reject) => {
      this._pendingCreates.set(requestId, { resolve, reject, cwd })

      this._remoteManager.send(serverId, {
        type: 'stream_create',
        requestId,
        cwd,
        sessionId,
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
    this._remoteManager.send(serverId, {
      type: 'stream_send',
      sessionId,
      text,
    })
  }

  interrupt(serverId: string, sessionId: string): void {
    this._remoteManager.send(serverId, {
      type: 'stream_interrupt',
      sessionId,
    })
  }

  async destroy(serverId: string, sessionId: string): Promise<void> {
    this._serverSessions.delete(sessionId)
    this._pendingPermissions.delete(sessionId)
    this._remoteManager.send(serverId, {
      type: 'stream_destroy',
      sessionId,
    })
  }

  approvePermission(serverId: string, sessionId: string, requestId: string): void {
    const result: PermissionResult = { behavior: 'allow', updatedInput: {} }
    this._pendingPermissions.delete(sessionId)
    this._sessionStore.resolvePermission(requestId, { decision: 'allow' })

    this._remoteManager.send(serverId, {
      type: 'stream_permission_response',
      sessionId,
      requestId,
      result,
    })
  }

  denyPermission(serverId: string, sessionId: string, requestId: string, reason?: string): void {
    const result: PermissionResult = { behavior: 'deny', message: reason ?? 'Denied by user' }
    this._pendingPermissions.delete(sessionId)
    this._sessionStore.resolvePermission(requestId, { decision: 'deny', reason })

    this._remoteManager.send(serverId, {
      type: 'stream_permission_response',
      sessionId,
      requestId,
      result,
    })
  }

  alwaysAllowPermission(serverId: string, sessionId: string, requestId: string): void {
    this.approvePermission(serverId, sessionId, requestId)
    this._remoteManager.send(serverId, {
      type: 'stream_set_permission_mode',
      sessionId,
      mode: 'auto',
    })
  }

  // ── Private ──────────────────────────────────────────────

  private _handleStreamEvent(serverId: string, message: StreamEventMessage): void {
    const internalSessionId = `remote:${serverId}:${message.sessionId}`
    const event = message.event

    // Ensure session exists in SessionStore
    if (!this._sessionStore.get(internalSessionId)) {
      const projectName = message.event.cwd
        ? message.event.cwd.split('/').filter(Boolean).pop() ?? 'remote'
        : 'remote'
      this._sessionStore.createStreamSession(internalSessionId, projectName)
      const session = this._sessionStore.get(internalSessionId)
      if (session) {
        (session as { source: string }).source = 'remote-stream'
      }
      this._serverSessions.set(internalSessionId, serverId)
    }

    // Translate StreamEvent to SessionStore operations
    // (mirrors StreamAdapterManager logic)
    this._translateEvent(internalSessionId, event)
  }

  private _translateEvent(sessionId: string, event: StreamEvent): void {
    switch (event.type) {
      case 'text':
        this._sessionStore.updateStreamingAssistant(sessionId, event.content ?? '', false)
        break

      case 'text_delta':
        // text_delta should append, but SessionStore.updateStreamingAssistant
        // replaces content. For remote, we accumulate manually.
        {
          const session = this._sessionStore.get(sessionId)
          const existing = session?.chatItems.find(i => i.type === 'assistant' && i.streaming)
          const prevContent = existing && existing.type === 'assistant' ? existing.content : ''
          this._sessionStore.updateStreamingAssistant(sessionId, prevContent + (event.content ?? ''), true)
        }
        break

      case 'tool_use':
        if (event.parentToolUseId) {
          this._sessionStore.addSubTool(sessionId, event.parentToolUseId, event.toolUseId!, event.toolName!, event.toolInput ?? {})
        } else {
          this._sessionStore.addToolCall(sessionId, event.toolUseId!, event.toolName!, event.toolInput ?? {})
        }
        break

      case 'tool_result':
        if (event.parentToolUseId) {
          this._sessionStore.updateSubTool(sessionId, event.parentToolUseId, event.toolUseId!, event.isError ? 'error' : 'success', event.content)
        } else {
          this._sessionStore.updateStreamToolCall(sessionId, event.toolUseId!, event.isError ? 'error' : 'success', event.content)
        }
        break

      case 'thinking':
        this._sessionStore.addThinking(sessionId, event.content ?? '')
        break

      case 'result': {
        this._sessionStore.cleanupRunningToolCalls(sessionId)
        if (event.subtype === 'interrupted') {
          this._sessionStore.addSystemMessage(sessionId, '会话已中断')
        }
        const session = this._sessionStore.get(sessionId)
        if (session && session.phase.type !== 'ended') {
          this._sessionStore.transition(session, event.subtype === 'interrupted' ? 'idle' : 'done')
        }
        this._sessionStore.addResultSummary(sessionId, {
          durationMs: event.durationMs,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          costUsd: event.costUsd,
          interrupted: event.subtype === 'interrupted',
        })
        break
      }

      case 'permission_request':
        this._pendingPermissions.set(sessionId, {
          sessionId,
          requestId: event.requestId!,
        })
        {
          const session = this._sessionStore.get(sessionId)
          if (session) {
            this._sessionStore.transition(session, 'waitingForApproval', {
              toolUseId: event.requestId ?? '',
              toolName: event.toolName ?? '',
              toolInput: event.toolInput ?? null,
              receivedAt: Date.now(),
            } as unknown as Partial<import('@coding-bubble/session-monitor').SessionPhase>)
          }
        }
        break

      case 'session_state':
        {
          const session = this._sessionStore.get(sessionId)
          if (session) {
            switch (event.state) {
              case 'idle':
                this._sessionStore.transition(session, 'idle')
                break
              case 'running':
                this._sessionStore.transition(session, 'thinking')
                break
              case 'requires_action':
                // Already handled by permission_request
                break
            }
          }
        }
        break

      case 'session_init':
        if (event.initMetadata) {
          this._sessionStore.setInitMetadata(sessionId, event.initMetadata)
        }
        break

      case 'tool_progress':
        this._sessionStore.updateToolProgress(sessionId, event.toolUseId!, event.elapsedSeconds!)
        break

      case 'tool_summary':
        this._sessionStore.addSystemStatus(sessionId, 'tool_summary', event.summary ?? '')
        break

      case 'system_status':
        this._sessionStore.addSystemStatus(sessionId, event.statusKind ?? 'unknown', event.errorMessage ?? '')
        break

      case 'task_lifecycle':
        switch (event.taskPhase) {
          case 'started':
            this._sessionStore.addTaskNotification(sessionId, event.taskId!, event.content ?? '')
            break
          case 'progress':
            this._sessionStore.updateTaskProgress(sessionId, event.taskId!, event.content ?? '')
            break
          case 'completed':
          case 'failed':
            this._sessionStore.completeTaskNotification(sessionId, event.taskId!, event.taskPhase, event.content ?? '')
            break
        }
        break

      case 'post_turn_summary':
        this._sessionStore.addSystemMessage(sessionId, event.title ?? event.content ?? '')
        break

      case 'rate_limit':
        this._sessionStore.addSystemStatus(sessionId, 'rate_limit', event.rateLimitStatus ?? 'Rate limited')
        break

      case 'error':
        this._sessionStore.addSystemMessage(sessionId, `Error: ${event.error?.message ?? 'Unknown error'}`)
        break

      case 'exit':
        {
          const session = this._sessionStore.get(sessionId)
          if (session && session.phase.type !== 'ended') {
            if (event.exitCode !== 0) {
              this._sessionStore.transition(session, 'error')
            } else {
              this._sessionStore.transition(session, 'done')
            }
          }
        }
        break
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
    pending.resolve(internalSessionId)
  }
}
