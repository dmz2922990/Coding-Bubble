import type {
  SessionState,
  SessionPhase,
  HookEvent,
  HookResponse,
  PendingPermission,
  ChatHistoryItem,
  Intervention,
  InterventionPhase,
  PermissionContext,
  PermissionSuggestion,
  InitMetadata
} from './types'
import { VALID_TRANSITIONS, STATE_PRIORITY, ONESHOT_TIMEOUTS } from './types'
import type { BubbleNotification, NotificationType, NotificationAutoCloseConfig } from './types'

/** Derive project name from cwd */
function projectNameFromCwd(cwd: string): string {
  const normalized = cwd.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}

function now(): number {
  return Date.now()
}

function newPhase(id: string): SessionPhase {
  switch (id) {
    case 'idle': return { type: 'idle' }
    case 'thinking': return { type: 'thinking' }
    case 'processing': return { type: 'processing' }
    case 'juggling': return { type: 'juggling' }
    case 'done': return { type: 'done' }
    case 'error': return { type: 'error' }
    case 'waitingForInput': return { type: 'waitingForInput' }
    case 'waitingForApproval': return { type: 'waitingForApproval', context: { toolUseId: '', toolName: '', toolInput: null, receivedAt: now(), suggestions: [] } }
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
  private _notifications = new Map<string, BubbleNotification>() // key: sessionId
  private _notificationConfig: NotificationAutoCloseConfig = {
    approval: 0,
    error: 30,
    input: 15,
    done: 15,
  }
  private _oneshotTimers = new Map<string, ReturnType<typeof setTimeout>>() // key: sessionId
  private _notificationTimers = new Map<string, ReturnType<typeof setTimeout>>() // key: sessionId
  private _onInterventionChange?: (interventions: Intervention[]) => void
  private _onNotificationChange?: (notifications: BubbleNotification[]) => void
  private _onPhaseChange?: () => void

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

  updateNotificationConfig(config: NotificationAutoCloseConfig): void {
    this._notificationConfig = { ...config }
    // Refresh autoCloseMs for all existing notifications
    let changed = false
    for (const [sessionId, notification] of this._notifications) {
      const newMs = config[notification.type] * 1000
      if (notification.autoCloseMs !== newMs) {
        notification.autoCloseMs = newMs
        changed = true
      }
    }
    if (changed) this._notifyNotificationChange()
  }

  setInitMetadata(sessionId: string, metadata: InitMetadata): void {
    const session = this._sessions.get(sessionId)
    if (session) {
      session.initMetadata = metadata
      console.log('[SessionStore] set init metadata for session:', sessionId, 'skills:', metadata.skills.length, 'commands:', metadata.slashCommands.length)
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
      case 'PostToolUseFailure':
      case 'Stop':
      case 'StopFailure':
      case 'SubagentStart':
      case 'SubagentStop':
      case 'PreCompact':
      case 'PostCompact':
      case 'Notification':
        this._handleGeneralEvent(event)
        break

      case 'PermissionRequest': {
        const payload = event.payload as Record<string, unknown> | undefined
        const toolName = (payload?.tool as string) ?? 'unknown'
        const toolInput = (payload?.input as Record<string, unknown>) ?? null
        const toolUseId = (payload?.toolUseId as string) ?? `auto_${Date.now()}`
        const suggestions = (payload?.suggestions as PermissionSuggestion[]) ?? []
        this._handlePermissionRequest(sessionId, toolUseId, toolName, toolInput, suggestions)
        break
      }

      case 'fileUpdated': {
        const items = (event.payload?.chatItems as ChatHistoryItem[]) ?? []
        const session = this._sessions.get(sessionId)
        if (session) {
          session.chatItems = items
          session.lastActivity = now()
          // Reset staleness timer on file update
          if (ONESHOT_TIMEOUTS[session.phase.type]) {
            this._setupOneshotRevert(session, ONESHOT_TIMEOUTS[session.phase.type]!)
          }
          // Detect interrupted state from chat history (e.g. Ctrl+C)
          const lastItem = items[items.length - 1]
          if (lastItem?.type === 'interrupted' && session.phase.type !== 'idle' && session.phase.type !== 'ended') {
            this.transition(session, 'idle')
          }
          this._publish('session:history', { sessionId, items: session.chatItems })
          this._publish('session:update', { sessionId, phase: session.phase })
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
      source: 'hook',
      pid,
      lastActivity: t,
      createdAt: t,
      permissionMode: 'auto' // Default to auto-allow
    })
  }

  /** Create a stream-json sourced session */
  createStreamSession(sessionId: string, cwd: string): void {
    if (this._sessions.has(sessionId)) return

    const t = now()
    this._sessions.set(sessionId, {
      sessionId,
      cwd,
      projectName: projectNameFromCwd(cwd),
      phase: { type: 'idle' },
      chatItems: [],
      source: 'stream',
      lastActivity: t,
      createdAt: t,
      permissionMode: 'default'
    })
  }

  private _endSession(sessionId: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return
    this.transition(session, 'ended')
    this._removeIntervention(sessionId)
    this._notifications.delete(sessionId)
    this._clearNotificationTimer(sessionId)
    this._notifyNotificationChange()
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
    // Reset staleness timer on any event
    if (ONESHOT_TIMEOUTS[session.phase.type]) {
      this._setupOneshotRevert(session, ONESHOT_TIMEOUTS[session.phase.type]!)
    }

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

        this.transition(session, 'thinking')
        break
      }
      case 'PreToolUse': {
        const prePayload = event.payload as Record<string, unknown> | undefined
        const toolUseId = (prePayload?.tool_use_id as string) ?? ''
        const toolName = (prePayload?.tool_name as string) ?? ''
        const toolInput = (prePayload?.tool_input as Record<string, unknown>) ?? {}

        // Update permission mode from PreToolUse payload
        const preMode = prePayload?.permission_mode as string | undefined
        if (preMode) {
          session.permissionMode = preMode
        }

        if (toolUseId && toolName) {
          this.addToolCall(sessionId, toolUseId, toolName, toolInput)
        }

        if (session.phase.type === 'thinking' || session.phase.type === 'error') {
          this.transition(session, 'processing')
        }
        break
      }
      case 'PostToolUse': {
        const payload = event.payload as Record<string, unknown> | undefined
        const toolUseId = payload?.tool_use_id as string
        const toolResponse = payload?.tool_response as Record<string, unknown> | undefined

        // Update tool status and result
        if (toolUseId) {
          this._updateToolResult(sessionId, toolUseId, toolResponse)
        }

        if (session.phase.type === 'waitingForApproval') {
          this.transition(session, 'processing')
        } else if (session.phase.type === 'thinking') {
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
        this.transition(session, 'done')
        break
      }
      case 'SubagentStop':
        if (session.phase.type === 'juggling') {
          this.transition(session, 'processing')
        }
        break
      case 'PreCompact':
        this.transition(session, 'compacting')
        break
      case 'PostCompact':
        if (session.phase.type === 'compacting') {
          this.transition(session, 'processing')
        }
        break
      case 'PostToolUseFailure':
        this.transition(session, 'error')
        break
      case 'StopFailure':
        this.transition(session, 'error')
        break
      case 'SubagentStart':
        if (session.phase.type === 'thinking' || session.phase.type === 'idle' || session.phase.type === 'processing') {
          this.transition(session, 'juggling')
        }
        break
    }

    this._publish('session:update', { sessionId, phase: session.phase })
  }

  private _handlePermissionRequest(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown> | null,
    suggestions: PermissionSuggestion[] = []
  ): void {
    const session = this._sessions.get(sessionId)
    if (!session) {
      this._createSession(sessionId, '')
    }

    const target = this._sessions.get(sessionId)!
    const context: PermissionContext = {
      toolUseId,
      toolName,
      toolInput,
      receivedAt: now(),
      suggestions,
    }
    this.transition(target, 'waitingForApproval', context as unknown as Partial<SessionPhase>)

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

    this._publish('session:permission', { sessionId, toolName, toolInput, suggestions })
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
              result: this._formatToolResult(toolResponse ?? {})
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
      content: content.replace(/\n{3,}/g, '\n\n'),
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

  addToolCall(sessionId: string, toolUseId: string, name: string, input: Record<string, unknown>): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: toolUseId,
      type: 'toolCall',
      tool: {
        name,
        input: input as Record<string, string>,
        status: 'running',
      },
      timestamp: now(),
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  addThinking(sessionId: string, content: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: `thinking_${Date.now()}`,
      type: 'thinking',
      content,
      timestamp: now(),
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  updateStreamToolCall(sessionId: string, toolUseId: string, status: 'success' | 'error', result?: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    for (let i = session.chatItems.length - 1; i >= 0; i--) {
      const item = session.chatItems[i]
      if (item.id === toolUseId && item.type === 'toolCall') {
        session.chatItems[i] = {
          ...item,
          tool: { ...item.tool, status, result },
        }
        this._publish('session:history', { sessionId, items: session.chatItems })
        return
      }
    }
  }

  cleanupRunningToolCalls(sessionId: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    let changed = false
    for (let i = 0; i < session.chatItems.length; i++) {
      const item = session.chatItems[i]
      if (item.type === 'toolCall' && item.tool.status === 'running') {
        session.chatItems[i] = {
          ...item,
          tool: { ...item.tool, status: 'success' },
        }
        changed = true
      }
    }
    if (changed) {
      this._publish('session:history', { sessionId, items: session.chatItems })
    }
  }

  addTaskNotification(sessionId: string, taskId: string, description: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: `task_${taskId}`,
      type: 'taskNotification',
      taskId,
      phase: 'started',
      description,
      progress: [],
      timestamp: now(),
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  updateTaskProgress(sessionId: string, taskId: string, description: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    for (let i = session.chatItems.length - 1; i >= 0; i--) {
      const item = session.chatItems[i]
      if (item.type === 'taskNotification' && item.taskId === taskId) {
        session.chatItems[i] = {
          ...item,
          phase: 'running',
          progress: [...item.progress, description],
        }
        this._publish('session:history', { sessionId, items: session.chatItems })
        return
      }
    }
  }

  completeTaskNotification(sessionId: string, taskId: string, phase: 'completed' | 'failed', summary: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    for (let i = session.chatItems.length - 1; i >= 0; i--) {
      const item = session.chatItems[i]
      if (item.type === 'taskNotification' && item.taskId === taskId) {
        session.chatItems[i] = {
          ...item,
          phase,
          summary,
        }
        this._publish('session:history', { sessionId, items: session.chatItems })
        return
      }
    }
  }

  addSubTool(sessionId: string, parentToolUseId: string, toolUseId: string, name: string, input: Record<string, unknown>): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    for (let i = session.chatItems.length - 1; i >= 0; i--) {
      const item = session.chatItems[i]
      if (item.type === 'toolCall' && item.id === parentToolUseId) {
        const subTools = [...(item.tool.subTools ?? []), {
          id: toolUseId,
          name,
          input: input as Record<string, string>,
          status: 'running' as const,
        }]
        session.chatItems[i] = {
          ...item,
          tool: { ...item.tool, subTools },
        }
        this._publish('session:history', { sessionId, items: session.chatItems })
        return
      }
    }
  }

  updateSubTool(sessionId: string, parentToolUseId: string, toolUseId: string, status: 'success' | 'error', result?: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    for (let i = session.chatItems.length - 1; i >= 0; i--) {
      const item = session.chatItems[i]
      if (item.type === 'toolCall' && item.id === parentToolUseId) {
        const subTools = (item.tool.subTools ?? []).map(st =>
          st.id === toolUseId ? { ...st, status, result } : st
        )
        session.chatItems[i] = {
          ...item,
          tool: { ...item.tool, subTools },
        }
        this._publish('session:history', { sessionId, items: session.chatItems })
        return
      }
    }
  }

  addSystemStatus(sessionId: string, statusKind: string, content: string): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: `sysstatus_${Date.now()}`,
      type: 'systemStatus',
      statusKind,
      content,
      timestamp: now()
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  addResultSummary(sessionId: string, data: { durationMs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; interrupted?: boolean }): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item: ChatHistoryItem = {
      id: `result_${Date.now()}`,
      type: 'resultSummary',
      durationMs: data.durationMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costUsd: data.costUsd,
      interrupted: data.interrupted,
      timestamp: now()
    }
    session.chatItems.push(item)
    this._publish('session:history', { sessionId, items: session.chatItems })
  }

  updateToolProgress(sessionId: string, toolUseId: string, elapsedSeconds: number): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    const item = session.chatItems.find(i => i.type === 'toolCall' && i.id === toolUseId)
    if (item && item.type === 'toolCall') {
      item.elapsedSeconds = elapsedSeconds
      this._publish('session:history', { sessionId, items: session.chatItems })
    }
  }

  updateStreamingAssistant(sessionId: string, content: string, streaming: boolean): void {
    const session = this._sessions.get(sessionId)
    if (!session) return

    // Find existing streaming assistant message or create new one
    const existing = session.chatItems.find(i => i.type === 'assistant' && i.streaming === true)
    if (existing && existing.type === 'assistant') {
      existing.content = content
      existing.streaming = streaming
    } else {
      const item: ChatHistoryItem = {
        id: `asst_${Date.now()}`,
        type: 'assistant',
        content,
        timestamp: now(),
        streaming
      }
      session.chatItems.push(item)
    }
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
        receivedAt: (context as { receivedAt?: number }).receivedAt ?? now(),
        suggestions: (context as { suggestions?: PermissionSuggestion[] }).suggestions ?? [],
      }
    }
    session.lastActivity = now()
    this._updateInterventions(session.sessionId, session.phase)
    this._updateNotifications(session)
    this._onPhaseChange?.()

    // ONESHOT auto-revert
    const timeout = ONESHOT_TIMEOUTS[newType]
    if (timeout) {
      this._setupOneshotRevert(session, timeout)
    } else {
      this._clearOneshotTimer(session.sessionId)
    }
  }

  private _setupOneshotRevert(session: SessionState, timeoutMs: number): void {
    const sessionId = session.sessionId
    this._clearOneshotTimer(sessionId)

    const timer = setTimeout(() => {
      this._oneshotTimers.delete(sessionId)
      const s = this._sessions.get(sessionId)
      if (!s) return
      // Only revert if still in the same ONESHOT state
      if (s.phase.type === session.phase.type) {
        this.transition(s, 'idle')
        this._publish('session:update', { sessionId, phase: s.phase })
      }
    }, timeoutMs)

    this._oneshotTimers.set(sessionId, timer)
  }

  private _clearOneshotTimer(sessionId: string): void {
    const existing = this._oneshotTimers.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      this._oneshotTimers.delete(sessionId)
    }
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

  resolveDisplayState(): SessionPhase {
    let best: SessionPhase = { type: 'idle' }
    let bestPriority = 0

    for (const session of this._sessions.values()) {
      if (session.phase.type === 'ended') continue
      const priority = STATE_PRIORITY[session.phase.type] ?? 0
      if (priority > bestPriority) {
        bestPriority = priority
        best = session.phase
      }
    }

    return best
  }

  onInterventionChange(cb: (interventions: Intervention[]) => void): void {
    this._onInterventionChange = cb
  }

  getPendingNotifications(): BubbleNotification[] {
    return Array.from(this._notifications.values())
  }

  dismissNotification(sessionId: string): void {
    if (this._notifications.has(sessionId)) {
      this._notifications.delete(sessionId)
      this._clearNotificationTimer(sessionId)
      this._notifyNotificationChange()
    }
  }

  onNotificationChange(cb: (notifications: BubbleNotification[]) => void): void {
    this._onNotificationChange = cb
  }

  onPhaseChange(cb: () => void): void {
    this._onPhaseChange = cb
  }

  private _updateNotifications(session: SessionState): void {
    const c = this._notificationConfig
    const phaseToType: Partial<Record<SessionPhase['type'], { type: NotificationType; autoCloseMs: number }>> = {
      done: { type: 'done', autoCloseMs: c.done * 1000 },
      error: { type: 'error', autoCloseMs: c.error * 1000 },
      waitingForApproval: { type: 'approval', autoCloseMs: c.approval * 1000 },
      waitingForInput: { type: 'input', autoCloseMs: c.input * 1000 },
    }

    const config = phaseToType[session.phase.type]
    if (config) {
      this._notifications.set(session.sessionId, {
        sessionId: session.sessionId,
        projectName: session.projectName,
        type: config.type,
        toolName: session.phase.type === 'waitingForApproval'
          ? (session.phase as { type: 'waitingForApproval'; context: { toolName: string } }).context?.toolName
          : undefined,
        timestamp: now(),
        autoCloseMs: config.autoCloseMs,
        isAskUserQuestion: session.phase.type === 'waitingForApproval'
          ? (session.phase as { type: 'waitingForApproval'; context: { toolName: string } }).context?.toolName === 'AskUserQuestion'
          : false,
        source: session.source,
      })

      // Start auto-close timer in main process for timed notifications
      this._clearNotificationTimer(session.sessionId)
      if (config.autoCloseMs > 0) {
        const sid = session.sessionId
        const timer = setTimeout(() => {
          this._notificationTimers.delete(sid)
          this._notifications.delete(sid)
          this._notifyNotificationChange()
        }, config.autoCloseMs)
        this._notificationTimers.set(session.sessionId, timer)
      }

      this._notifyNotificationChange()
    } else {
      // Non-notification phase: only clear notifications without auto-close timer.
      // Timed notifications (done/error) persist until their main-process timer fires.
      const existing = this._notifications.get(session.sessionId)
      if (!existing || existing.autoCloseMs === 0) {
        this._notifications.delete(session.sessionId)
        this._clearNotificationTimer(session.sessionId)
        this._notifyNotificationChange()
      }
    }
  }

  private _clearNotificationTimer(sessionId: string): void {
    const existing = this._notificationTimers.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      this._notificationTimers.delete(sessionId)
    }
  }

  private _notifyNotificationChange(): void {
    this._onNotificationChange?.(this.getPendingNotifications())
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
