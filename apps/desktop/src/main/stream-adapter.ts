import { StreamSession } from '@coding-bubble/stream-json'
import type { StreamEvent, PermissionResult } from '@coding-bubble/stream-json'
import type { SessionStore } from '@coding-bubble/session-monitor'
import type { HookResponse } from '@coding-bubble/session-monitor'

export interface StreamAdapterOptions {
  sessionStore: SessionStore
  broadcastToRenderer: (channel: string, data: unknown) => void
  onPermissionRequest: (
    sessionId: string,
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown> | null
  ) => Promise<HookResponse>
}

export class StreamAdapterManager {
  private _sessions = new Map<string, StreamSession>()
  /** Set of PIDs managed by stream sessions — hook events from these PIDs should be ignored */
  private _managedPids = new Set<number>()
  private _store: SessionStore
  private _broadcast: (channel: string, data: unknown) => void
  private _onPermissionRequest: StreamAdapterOptions['onPermissionRequest']

  constructor(options: StreamAdapterOptions) {
    this._store = options.sessionStore
    this._broadcast = options.broadcastToRenderer
    this._onPermissionRequest = options.onPermissionRequest
  }

  get(sessionId: string): StreamSession | undefined {
    return this._sessions.get(sessionId)
  }

  /** Check if a PID belongs to a stream-managed process */
  isManagedPid(pid: number | undefined): boolean {
    return pid != null && this._managedPids.has(pid)
  }

  async create(cwd: string, sessionId?: string): Promise<string> {
    const stream = new StreamSession()
    const internalId = sessionId ?? `stream_${Date.now()}`

    this._store.createStreamSession(internalId, cwd)
    this._sessions.set(internalId, stream)

    stream.on('event', (event: StreamEvent) => this._handleEvent(internalId, event))

    stream.spawn({
      cwd,
      sessionId: sessionId ?? '',
    })

    // Track PID to filter hook events from this process
    if (stream.pid) this._managedPids.add(stream.pid)

    this._store.process({
      hook_event_name: 'SessionStart',
      session_id: internalId,
      cwd,
      payload: {},
    })

    return internalId
  }

  async resume(claudeSessionId: string, cwd: string): Promise<string> {
    const stream = new StreamSession()
    const internalId = `stream_${Date.now()}`

    this._store.createStreamSession(internalId, cwd)
    this._sessions.set(internalId, stream)

    stream.on('event', (event: StreamEvent) => this._handleEvent(internalId, event))

    stream.spawn({
      cwd,
      sessionId: claudeSessionId,
    })

    // Track PID to filter hook events from this process
    if (stream.pid) this._managedPids.add(stream.pid)

    this._store.process({
      hook_event_name: 'SessionStart',
      session_id: internalId,
      cwd,
      payload: {},
    })

    return internalId
  }

  send(sessionId: string, text: string): void {
    const stream = this._sessions.get(sessionId)
    if (!stream?.alive) throw new Error(`No active stream session: ${sessionId}`)

    // Add user message to chat items
    this._store.process({
      hook_event_name: 'UserPromptSubmit',
      session_id: sessionId,
      cwd: '',
      payload: { prompt: text },
    })

    stream.send(text)
  }

  respondPermission(sessionId: string, requestId: string, result: PermissionResult): void {
    const stream = this._sessions.get(sessionId)
    if (!stream?.alive) return

    stream.respondPermission(requestId, result)

    if (result.behavior === 'allow') {
      this._store.process({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })
    }
  }

  async destroy(sessionId: string): Promise<void> {
    const stream = this._sessions.get(sessionId)
    if (!stream) return

    if (stream.pid) this._managedPids.delete(stream.pid)
    await stream.close()
    this._sessions.delete(sessionId)

    this._store.process({
      hook_event_name: 'SessionEnd',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })
  }

  async closeAll(): Promise<void> {
    const promises = Array.from(this._sessions.keys()).map(id => this.destroy(id))
    await Promise.all(promises)
  }

  private _handleEvent(sessionId: string, event: StreamEvent): void {
    switch (event.type) {
      case 'text': {
        const session = this._store.get(sessionId)
        if (!session) return
        this._store.addSystemMessage(sessionId, event.content ?? '')
        this._broadcast('session:update', { sessionId, phase: session.phase })
        break
      }

      case 'tool_use': {
        this._store.process({
          hook_event_name: 'PreToolUse',
          session_id: sessionId,
          cwd: '',
          payload: {
            tool_use_id: event.toolUseId,
            tool_name: event.toolName,
            tool_input: event.toolInput,
          },
        })
        break
      }

      case 'thinking': {
        this._store.process({
          hook_event_name: 'Notification',
          session_id: sessionId,
          cwd: '',
          payload: { type: 'thinking', content: event.content },
        })
        break
      }

      case 'result': {
        this._store.process({
          hook_event_name: 'Stop',
          session_id: sessionId,
          cwd: '',
          payload: { last_assistant_message: event.content ?? '' },
        })
        break
      }

      case 'permission_request': {
        // Delegate to main process permission handler
        this._onPermissionRequest(
          sessionId,
          event.requestId ?? '',
          event.toolName ?? 'unknown',
          event.toolInput ?? null
        ).then((response: HookResponse) => {
          const result: PermissionResult = response.decision === 'allow'
            ? { behavior: 'allow', updatedInput: response.updatedInput }
            : { behavior: 'deny', message: response.reason ?? '' }
          this.respondPermission(sessionId, event.requestId ?? '', result)
        }).catch((err) => {
          console.error('[stream-adapter] permission handler error:', err)
        })
        break
      }

      case 'exit': {
        if (event.exitCode !== 0 && event.exitCode !== null) {
          this._store.process({
            hook_event_name: 'StopFailure',
            session_id: sessionId,
            cwd: '',
            payload: {},
          })
        }
        break
      }

      case 'error': {
        console.error('[stream-adapter] error for session:', sessionId, event.error)
        break
      }
    }
  }
}
