import { StreamSession } from '@coding-bubble/stream-json'
import type { StreamEvent, StreamSessionOptions } from '@coding-bubble/stream-json'
import type { RemoteServer } from './server'
import type {
  StreamCreateMessage,
  StreamCreateResultMessage,
  StreamSendMessage,
  StreamInterruptMessage,
  StreamDestroyMessage,
  StreamPermissionResponseMessage,
  StreamSetPermissionModeMessage,
  ServerMessage,
} from '../shared/protocol'

interface ManagedSession {
  session: StreamSession
  sessionId: string
  permissionMode: string
}

export class StreamHandler {
  private _server: RemoteServer
  private _sessions = new Map<string, ManagedSession>()

  constructor(server: RemoteServer) {
    this._server = server
  }

  async handleCreate(message: StreamCreateMessage): Promise<void> {
    const internalId = `rs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    try {
      const streamSession = new StreamSession()
      const options: StreamSessionOptions = {
        cwd: message.cwd,
        sessionId: message.sessionId,
        model: message.model,
        permissionMode: message.permissionMode,
      }

      let initFired = false

      // Forward all stream events to client
      streamSession.on('event', (event: StreamEvent) => {
        this._server.send({
          type: 'stream_event',
          sessionId: internalId,
          event,
        })

        // Send stream_create_result after session is initialized
        if (!initFired && event.type === 'session_init') {
          initFired = true
          this._server.send({
            type: 'stream_create_result',
            requestId: message.requestId,
            sessionId: internalId,
          })
        }
      })

      streamSession.spawn(options)

      this._sessions.set(internalId, {
        session: streamSession,
        sessionId: internalId,
        permissionMode: message.permissionMode ?? 'default',
      })

      // Fallback: if process exits before init, send error
      streamSession.on('event', (event: StreamEvent) => {
        if (!initFired && event.type === 'exit') {
          initFired = true
          this._server.send({
            type: 'stream_create_result',
            requestId: message.requestId,
            error: 'Process exited before initialization',
          })
          this._sessions.delete(internalId)
        }
      })
    } catch (err) {
      this._server.send({
        type: 'stream_create_result',
        requestId: message.requestId,
        error: (err as Error).message,
      })
    }
  }

  handleSend(message: StreamSendMessage): void {
    const managed = this._sessions.get(message.sessionId)
    if (!managed) return
    managed.session.send(message.text)
  }

  handleInterrupt(message: StreamInterruptMessage): void {
    const managed = this._sessions.get(message.sessionId)
    if (!managed) return
    managed.session.interrupt()
  }

  async handleDestroy(message: StreamDestroyMessage): Promise<void> {
    const managed = this._sessions.get(message.sessionId)
    if (!managed) return
    this._sessions.delete(message.sessionId)
    await managed.session.close()
  }

  handlePermissionResponse(message: StreamPermissionResponseMessage): void {
    const managed = this._sessions.get(message.sessionId)
    if (!managed) return
    managed.session.respondPermission(message.requestId, message.result)
  }

  handleSetPermissionMode(message: StreamSetPermissionModeMessage): void {
    const managed = this._sessions.get(message.sessionId)
    if (!managed) return
    managed.permissionMode = message.mode
  }

  async destroyAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [id, managed] of this._sessions) {
      this._sessions.delete(id)
      promises.push(managed.session.close())
    }
    await Promise.allSettled(promises)
  }
}
