import type {
  SessionState,
  SessionPhase,
  HookEvent,
  HookResponse,
  PendingPermission,
  ChatHistoryItem
} from './types'
import { VALID_TRANSITIONS } from './types'

/** Derive project name from cwd */
function projectNameFromCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}

function now(): number {
  return Date.now()
}

function newPhase(id: string): SessionPhase {
  switch (id) {
    case 'idle': return { type: 'idle' }
    case 'processing': return { type: 'processing' }
    case 'waitingForInput': return { type: 'waitingForInput' }
    case 'waitingForApproval': return { type: 'waitingForApproval', context: { toolUseId: '', toolName: '', toolInput: null, receivedAt: now() } }
    case 'compacting': return { type: 'compacting' }
    case 'ended': return { type: 'ended' }
    default: return { type: 'idle' }
  }
}

export class SessionStore {
  private _sessions = new Map<string, SessionState>()
  private _pendingPermissions = new Map<string, PendingPermission[]>() // key: toolUseId
  private _invalidTransitions: Array<{ sessionId: string; from: string; to: string }> = []

  get sessions(): ReadonlyMap<string, SessionState> {
    return this._sessions
  }

  get(sessionId: string): SessionState | undefined {
    return this._sessions.get(sessionId)
  }

  async resolvePermission(toolUseId: string, response: HookResponse): Promise<void> {
    const pending = this._pendingPermissions.get(toolUseId)
    if (!pending?.length) return

    const item = pending.shift()!
    if (pending.length === 0) this._pendingPermissions.delete(toolUseId)

    const session = this._sessions.get(item.sessionId)
    if (!session) return

    if (response.decision === 'allow') {
      this.transition(session, 'processing')
    } else {
      this.transition(session, 'idle')
    }

    this._publish('session:update', { sessionId: session.sessionId, phase: session.phase })
  }

  process(event: HookEvent): void {
    const { hook_event_name: eventName, session_id: sessionId, cwd } = event

    switch (eventName) {
      case 'SessionStart':
        this._createSession(sessionId, cwd)
        this._publish('session:new', { sessionId })
        break

      case 'SessionEnd':
        this._endSession(sessionId)
        this._publish('session:ended', { sessionId })
        break

      case 'UserPromptSubmit':
      case 'PreToolUse':
      case 'PostToolUse':
      case 'Notification':
      case 'Stop':
      case 'SubagentStop':
      case 'PreCompact':
        this._handleGeneralEvent(event)
        break

      case 'PermissionRequest': {
        const payload = event.payload as Record<string, unknown> | undefined
        const toolName = (payload?.tool as string) ?? 'unknown'
        const toolInput = (payload?.input as Record<string, unknown>) ?? null
        const toolUseId = (payload?.toolUseId as string) ?? `auto_${Date.now()}`
        this._handlePermissionRequest(sessionId, toolUseId, toolName, toolInput)
        break
      }

      case 'fileUpdated': {
        const items = (event.payload?.chatItems as ChatHistoryItem[]) ?? []
        const session = this._sessions.get(sessionId)
        if (session) {
          session.chatItems = items
          session.lastActivity = now()
          this._publish('session:history', { sessionId, items })
        }
        break
      }

      default:
        break
    }
  }

  // ── Private ──────────────────────────────────────────────

  private _createSession(sessionId: string, cwd: string): void {
    if (this._sessions.has(sessionId)) return

    const t = now()
    this._sessions.set(sessionId, {
      sessionId,
      cwd,
      projectName: projectNameFromCwd(cwd),
      phase: { type: 'idle' },
      chatItems: [],
      lastActivity: t,
      createdAt: t
    })
  }

  private _endSession(sessionId: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return
    this.transition(session, 'ended')
    setTimeout(() => this._sessions.delete(sessionId), 0)
  }

  private _handleGeneralEvent(event: HookEvent): void {
    const { session_id: sessionId, hook_event_name: eventName } = event
    let session = this._sessions.get(sessionId)

    if (!session) {
      this._createSession(sessionId, event.cwd)
      session = this._sessions.get(sessionId)!
    }

    session.lastActivity = now()

    switch (eventName) {
      case 'UserPromptSubmit':
      case 'PreToolUse':
        this.transition(session, 'processing')
        break
      case 'PostToolUse':
        this.transition(session, 'idle')
        break
      case 'Notification':
        break
      case 'Stop':
      case 'SubagentStop':
        this.transition(session, 'waitingForInput')
        break
      case 'PreCompact':
        this.transition(session, 'compacting')
        break
    }

    this._publish('session:update', { sessionId, phase: session.phase })
  }

  private _handlePermissionRequest(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown> | null
  ): void {
    const session = this._sessions.get(sessionId)
    if (!session) {
      this._createSession(sessionId, '')
    }

    const target = this._sessions.get(sessionId)!
    const context = { toolUseId, toolName, toolInput, receivedAt: now() }
    this.transition(target, 'waitingForApproval', context)

    const pending: PendingPermission = {
      sessionId,
      toolUseId,
      toolName,
      toolInput,
      resolve: (resp) => void 0, // will be overridden by socket-server
      receivedAt: now()
    }

    const queue = this._pendingPermissions.get(toolUseId) ?? []
    queue.push(pending)
    this._pendingPermissions.set(toolUseId, queue)

    this._publish('session:permission', { sessionId, toolName, toolInput })
  }

  transition(session: SessionState, newType: SessionPhase['type'], context?: Partial<SessionState['phase']>): void {
    const currentType = session.phase.type
    const allowed = VALID_TRANSITIONS[currentType]

    if (!allowed.includes(newType)) {
      this._invalidTransitions.push({ sessionId: session.sessionId, from: currentType, to: newType })
      return
    }

    session.phase = newPhase(newType)
    if (newType === 'waitingForApproval' && context?.type === 'waitingForApproval') {
      session.phase = context
    }
    session.lastActivity = now()
  }

  private _publish(channel: string, data: unknown): void {
    // To be wired by main process IPC bridge
    this._onPublish?.(channel, data)
  }

  private _onPublish?: (channel: string, data: unknown) => void

  onPublish(cb: (channel: string, data: unknown) => void): void {
    this._onPublish = cb
  }
}
