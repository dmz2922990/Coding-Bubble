import type { WebSocket } from 'ws'
import { createSocketServer, installHooks, uninstallHooks } from '@coding-bubble/session-monitor'
import type { HookEvent, HookResponse, PermissionSuggestion } from '@coding-bubble/session-monitor'
import type { RemoteServer } from './server'
import type { HookPermissionResponseMessage } from '../shared/protocol'

const PERMISSION_TIMEOUT_MS = 120_000

interface PendingPermission {
  sessionId: string
  toolUseId: string
  resolve: (response: HookResponse) => void
  timer: ReturnType<typeof setTimeout>
}

export class HookCollector {
  private _server: RemoteServer
  private _pendingPermissions = new Map<string, PendingPermission>()
  private _closeSocketServer: (() => Promise<void>) | null = null

  constructor(server: RemoteServer) {
    this._server = server
  }

  async start(): Promise<void> {
    await installHooks()

    this._closeSocketServer = createSocketServer({
      onEvent: (event: HookEvent) => {
        if (!this._server.hasClient) return
        this._server.send({
          type: 'hook_event',
          sessionId: event.session_id,
          event,
        })
      },
      onPermissionRequest: async (
        sessionId: string,
        toolUseId: string,
        toolName: string,
        toolInput: Record<string, unknown> | null,
        suggestions: PermissionSuggestion[] = []
      ): Promise<HookResponse> => {
        if (!this._server.hasClient) {
          return { decision: 'deny', reason: 'No client connected' }
        }

        // Forward the PermissionRequest hook event to client
        const event: HookEvent = {
          hook_event_name: 'PermissionRequest',
          session_id: sessionId,
          cwd: '',
          payload: {
            tool: toolName,
            input: toolInput,
            toolUseId,
            suggestions,
          },
        }
        this._server.send({ type: 'hook_event', sessionId, event })

        // Wait for client response with timeout
        return new Promise<HookResponse>((resolve) => {
          const key = `${sessionId}:${toolUseId}`
          const timer = setTimeout(() => {
            this._pendingPermissions.delete(key)
            resolve({ decision: 'deny', reason: 'Timeout waiting for client response' })
          }, PERMISSION_TIMEOUT_MS)

          this._pendingPermissions.set(key, { sessionId, toolUseId, resolve, timer })
        })
      },
    })['close'].bind(null)
  }

  handlePermissionResponse(message: HookPermissionResponseMessage): void {
    const key = `${message.sessionId}:${message.toolUseId}`
    const pending = this._pendingPermissions.get(key)
    if (!pending) return

    clearTimeout(pending.timer)
    this._pendingPermissions.delete(key)
    pending.resolve(message.response)
  }

  denyAllPending(reason: string): void {
    for (const [key, pending] of this._pendingPermissions) {
      clearTimeout(pending.timer)
      pending.resolve({ decision: 'deny', reason })
    }
    this._pendingPermissions.clear()
  }

  async stop(): Promise<void> {
    this.denyAllPending('Server shutting down')
    if (this._closeSocketServer) {
      await this._closeSocketServer()
    }
    await uninstallHooks()
  }
}
