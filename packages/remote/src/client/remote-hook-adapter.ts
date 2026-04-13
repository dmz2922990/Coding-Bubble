import type { SessionStore } from '@coding-bubble/session-monitor'
import type { HookEvent, HookResponse } from '@coding-bubble/session-monitor'
import type { RemoteManager } from './remote-manager'
import type { ServerMessage, HookEventMessage, HookPermissionResponseMessage } from '../shared/protocol'

interface PendingHookPermission {
  sessionId: string
  toolUseId: string
  resolve: (response: HookResponse) => void
}

export class RemoteHookAdapter {
  private _remoteManager: RemoteManager
  private _sessionStore: SessionStore
  private _pendingPermissions = new Map<string, PendingHookPermission>()

  constructor(remoteManager: RemoteManager, sessionStore: SessionStore) {
    this._remoteManager = remoteManager
    this._sessionStore = sessionStore
  }

  register(): void {
    this._remoteManager.onMessage((serverId, message) => {
      if (message.type === 'hook_event') {
        this._handleHookEvent(serverId, message)
      }
    })
  }

  closeSession(serverId: string, sessionId: string): void {
    this._remoteManager.send(serverId, {
      type: 'hook_session_close',
      sessionId,
    })
  }

  private _handleHookEvent(serverId: string, message: HookEventMessage): void {
    const event = message.event

    // For remote hook sessions, we need to override the source
    // SessionStore._createSession sets source='hook' by default,
    // but we need 'remote-hook'. We handle this by pre-processing.
    this._processRemoteHookEvent(serverId, event)
  }

  private _processRemoteHookEvent(serverId: string, event: HookEvent): void {
    const sessionId = `remote:${serverId}:${event.session_id}`
    const remoteEvent: HookEvent = {
      ...event,
      session_id: sessionId,
    }

    // For PermissionRequest, we need to intercept and relay
    if (event.hook_event_name === 'PermissionRequest') {
      const payload = event.payload as Record<string, unknown> | undefined
      const toolUseId = (payload?.toolUseId as string) ?? `auto_${Date.now()}`
      const toolName = (payload?.tool as string) ?? 'unknown'
      const toolInput = (payload?.input as Record<string, unknown>) ?? null

      // Process through SessionStore (creates session if needed, transitions phase)
      this._sessionStore.process(remoteEvent)

      // Store pending permission — will be resolved by approvePermission/denyPermission
      this._pendingPermissions.set(`${sessionId}:${toolUseId}`, {
        sessionId,
        toolUseId,
        resolve: () => {}, // Will be replaced when approve/deny is called
      })
      return
    }

    // For non-permission events, process normally
    this._sessionStore.process(remoteEvent)

    // Override source to 'remote-hook' after creation
    const session = this._sessionStore.get(sessionId)
    if (session && session.source === 'hook') {
      (session as { source: string }).source = 'remote-hook'
    }
  }

  approvePermission(serverId: string, sessionId: string, toolUseId: string): void {
    const key = `${sessionId}:${toolUseId}`
    const pending = this._pendingPermissions.get(key)
    if (!pending) return

    this._pendingPermissions.delete(key)
    this._sessionStore.resolvePermission(toolUseId, { decision: 'allow' })

    // Extract original session_id from the compound sessionId
    const originalSessionId = sessionId.replace(`remote:${serverId}:`, '')

    const response: HookPermissionResponseMessage = {
      type: 'hook_permission_response',
      sessionId: originalSessionId,
      toolUseId,
      response: { decision: 'allow' },
    }
    this._remoteManager.send(serverId, response)
  }

  denyPermission(serverId: string, sessionId: string, toolUseId: string, reason?: string): void {
    const key = `${sessionId}:${toolUseId}`
    const pending = this._pendingPermissions.get(key)
    if (!pending) return

    this._pendingPermissions.delete(key)
    this._sessionStore.resolvePermission(toolUseId, { decision: 'deny', reason })

    const originalSessionId = sessionId.replace(`remote:${serverId}:`, '')

    const response: HookPermissionResponseMessage = {
      type: 'hook_permission_response',
      sessionId: originalSessionId,
      toolUseId,
      response: { decision: 'deny', reason: reason ?? 'Denied by user' },
    }
    this._remoteManager.send(serverId, response)
  }
}
