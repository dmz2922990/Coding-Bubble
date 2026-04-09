import type {
  SessionState,
  SessionPhase,
  HookEvent,
  HookResponse,
  PendingPermission,
  ChatHistoryItem,
  Intervention,
  InterventionPhase
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
  private _interventions = new Map<string, Intervention>() // key: sessionId
  private _onInterventionChange?: (interventions: Intervention[]) => void

  get sessions(): ReadonlyMap<string, SessionState> {
    return this._sessions
  }

  get(sessionId: string): SessionState | undefined {
    return this._sessions.get(sessionId)
  }

  setPermissionMode(sessionId: string, mode: string): void {
    const session = this._sessions.get(sessionId)
    if (session) {
      session.permissionMode = mode
      console.log('[SessionStore] set permission mode to', mode, 'for session:', sessionId)
    }
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
    const { hook_event_name: eventName, session_id: sessionId, cwd, pid } = event

    switch (eventName) {
      case 'SessionStart':
        this._createSession(sessionId, cwd, pid)
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

  private _createSession(sessionId: string, cwd: string, pid?: number): void {
    if (this._sessions.has(sessionId)) return

    const t = now()
    this._sessions.set(sessionId, {
      sessionId,
      cwd,
      projectName: projectNameFromCwd(cwd),
      phase: { type: 'idle' },
      chatItems: [],
      pid,
      lastActivity: t,
      createdAt: t,
      permissionMode: 'auto' // Default to auto-allow
    })
  }

  private _endSession(sessionId: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return
    this.transition(session, 'ended')
    this._removeIntervention(sessionId)
    setTimeout(() => this._sessions.delete(sessionId), 0)
  }

  private _handleGeneralEvent(event: HookEvent): void {
    const { session_id: sessionId, hook_event_name: eventName } = event
    let session = this._sessions.get(sessionId)

    if (!session) {
      this._createSession(sessionId, event.cwd, event.pid)
      session = this._sessions.get(sessionId)!
    }

    if (event.pid != null) {
      session.pid = event.pid
    }
    session.lastActivity = now()

    switch (eventName) {
      case 'UserPromptSubmit': {
        const permissionMode = (event.payload?.permission_mode as string) ?? session.permissionMode
        session.permissionMode = permissionMode

        const prompt = event.payload?.prompt as string | undefined
        if (prompt) {
          const isTaskNotification = prompt.includes('<task-notification>')
          let item: ChatHistoryItem
          if (isTaskNotification) {
            const summaryMatch = prompt.match(/<summary>([\s\S]*?)<\/summary>/)
            item = {
              id: `sys_${Date.now()}`,
              type: 'system',
              content: summaryMatch ? summaryMatch[1].trim() : prompt,
              timestamp: now()
            }
          } else {
            item = {
              id: `user_${Date.now()}`,
              type: 'user',
              content: prompt,
              timestamp: now()
            }
          }
          session.chatItems.push(item)
          this._publish('session:history', { sessionId, items: session.chatItems })
        }

        this.transition(session, 'processing')
        break
      }
      case 'PreToolUse':
        // Don't transition - stay in current state (likely processing)
        break
      case 'PostToolUse': {
        const payload = event.payload as Record<string, unknown> | undefined
        const toolUseId = payload?.tool_use_id as string
        const toolResponse = payload?.tool_response as Record<string, unknown> | undefined

        // Update tool status and result
        if (toolUseId) {
          this._updateToolResult(sessionId, toolUseId, toolResponse)
        }

        // If session was waiting for approval and tool is now complete,
        // transition to processing (user approved/denied in Claude Code terminal)
        if (session.phase.type === 'waitingForApproval') {
          console.log('[SessionStore] PostToolUse: auto-transition from waitingForApproval to processing')
          this.transition(session, 'processing')
        }
        break
      }
      case 'Notification':
        break
      case 'Stop': {
        const stopPayload = event.payload as Record<string, unknown> | undefined
        const lastMessage = stopPayload?.last_assistant_message as string | undefined
        if (lastMessage && lastMessage.length > 0) {
          this._addAssistantMessage(sessionId, lastMessage)
        }
        this.transition(session, 'waitingForInput')
        break
      }
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
    // Pass context as separate properties for transition to assemble into nested structure
    const context = {
      toolUseId,
      toolName,
      toolInput,
      receivedAt: now()
    }
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

  private _updateToolResult(sessionId: string, toolUseId: string, toolResponse: Record<string, unknown> | undefined): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    // Find the chat item with matching toolUseId and update its result
    for (let i = 0; i < session.chatItems.length; i++) {
      const item = session.chatItems[i]
      if (item.id === toolUseId && item.type === 'toolCall') {
        const tool = item.tool
        if (tool.status === 'running' || tool.status === 'waitingForApproval') {
          // Update the tool item with result
          session.chatItems[i] = {
            ...item,
            tool: {
              ...tool,
              status: toolResponse?.interrupted ? 'interrupted' : 'success',
              result: this._formatToolResult(toolResponse)
            }
          }
          console.log('[SessionStore] updated tool result for:', toolUseId)

          // Notify renderer about the updated items
          this._publish('session:history', { sessionId, items: session.chatItems })
        }
        break
      }
    }
  }

  private _formatToolResult(toolResponse: Record<string, unknown>): string {
    const stdout = toolResponse.stdout as string | undefined
    const stderr = toolResponse.stderr as string | undefined
    const output = []

    if (stdout) output.push(stdout)
    if (stderr) output.push(stderr)

    return output.join('\n').trim() || '(no output)'
  }

  private _addAssistantMessage(sessionId: string, content: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    // Add assistant message to chat items
    const item: ChatHistoryItem = {
      id: `assistant_${Date.now()}`,
      type: 'assistant',
      content: content.replace(/\n\n+/g, '\n'),
      timestamp: now()
    }
    session.chatItems.push(item)
    console.log('[SessionStore] added assistant message for session:', sessionId)

    // Notify renderer about new items
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  addSystemMessage(sessionId: string, content: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: `system_${Date.now()}`,
      type: 'system',
      content,
      timestamp: now()
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  transition(session: SessionState, newType: SessionPhase['type'], context?: Partial<SessionState['phase']>): void {
    const currentType = session.phase.type
    const allowed = VALID_TRANSITIONS[currentType]

    if (!allowed.includes(newType)) {
      this._invalidTransitions.push({ sessionId: session.sessionId, from: currentType, to: newType })
      return
    }

    session.phase = newPhase(newType)
    if (newType === 'waitingForApproval' && context) {
      // For waitingForApproval, context should be nested under phase.context
      const phaseWithContext = session.phase as { type: 'waitingForApproval', context: PermissionContext }
      phaseWithContext.context = {
        toolUseId: (context as { toolUseId?: string }).toolUseId ?? '',
        toolName: (context as { toolName?: string }).toolName ?? '',
        toolInput: (context as { toolInput?: Record<string, unknown> | null }).toolInput ?? null,
        receivedAt: (context as { receivedAt?: number }).receivedAt ?? now()
      }
    }
    session.lastActivity = now()
    this._updateInterventions(session.sessionId, session.phase)
  }

  private _publish(channel: string, data: unknown): void {
    console.log('[SessionStore] _publish channel:', channel, 'data:', JSON.stringify(data))
    // To be wired by main process IPC bridge
    this._onPublish?.(channel, data)
  }

  private _onPublish?: (channel: string, data: unknown) => void

  onPublish(cb: (channel: string, data: unknown) => void): void {
    this._onPublish = cb
  }

  getPendingInterventions(): Intervention[] {
    return Array.from(this._interventions.values())
  }

  onInterventionChange(cb: (interventions: Intervention[]) => void): void {
    this._onInterventionChange = cb
  }

  private _updateInterventions(sessionId: string, phase: SessionPhase): void {
    const isIntervention = phase.type === 'waitingForApproval' || phase.type === 'waitingForInput'
    const existing = this._interventions.get(sessionId)

    if (isIntervention && !existing) {
      const session = this._sessions.get(sessionId)
      if (!session) return
      const intervention: Intervention = {
        sessionId,
        projectName: session.projectName,
        phase: phase.type as InterventionPhase,
        toolName: phase.type === 'waitingForApproval' ? (phase as { type: 'waitingForApproval'; context: { toolName: string } }).context?.toolName : undefined
      }
      this._interventions.set(sessionId, intervention)
      this._notifyInterventionChange()
    } else if (isIntervention && existing) {
      const session = this._sessions.get(sessionId)
      if (!session) return
      existing.phase = phase.type as InterventionPhase
      existing.projectName = session.projectName
      existing.toolName = phase.type === 'waitingForApproval' ? (phase as { type: 'waitingForApproval'; context: { toolName: string } }).context?.toolName : undefined
      this._notifyInterventionChange()
    } else if (!isIntervention && existing) {
      this._interventions.delete(sessionId)
      this._notifyInterventionChange()
    }
  }

  private _removeIntervention(sessionId: string): void {
    if (this._interventions.has(sessionId)) {
      this._interventions.delete(sessionId)
      this._notifyInterventionChange()
    }
  }

  private _notifyInterventionChange(): void {
    this._onInterventionChange?.(this.getPendingInterventions())
  }
}
