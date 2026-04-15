import { StreamSession } from '@coding-bubble/stream-json'
import type { StreamEvent, PermissionResult } from '@coding-bubble/stream-json'
import type { SessionStore, HookResponse } from '@coding-bubble/session-monitor'
import { formatToolDetail } from './format-tool-detail'

interface PendingStreamPermission {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown> | null
  formattedDetail: string
  resolve: (response: HookResponse) => void
}

export interface StreamAdapterOptions {
  sessionStore: SessionStore
  broadcastToRenderer: (channel: string, data: unknown) => void
}

/** Context objects needed by the shared stream event handler */
export interface StreamEventContext {
  pendingPermissions: Map<string, PendingStreamPermission>
  subToolParents: Map<string, string>
  interrupted: Set<string>
  destroying: Set<string>
}

export class StreamAdapterManager {
  private _sessions = new Map<string, StreamSession>()
  private _managedPids = new Set<number>()
  private _destroying = new Set<string>()
  private _store: SessionStore
  private _broadcast: (channel: string, data: unknown) => void
  private _pendingPermissions = new Map<string, PendingStreamPermission>()
  private _interrupted = new Set<string>()
  private _subToolParents = new Map<string, string>()

  constructor(options: StreamAdapterOptions) {
    this._store = options.sessionStore
    this._broadcast = options.broadcastToRenderer
  }

  get(sessionId: string): StreamSession | undefined {
    return this._sessions.get(sessionId)
  }

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
    this._store.process({
      hook_event_name: 'UserPromptSubmit',
      session_id: sessionId,
      cwd: '',
      payload: { prompt: text },
    })

    const stream = this._sessions.get(sessionId)
    if (!stream?.alive) throw new Error(`No active stream session: ${sessionId}`)

    stream.send(text)
  }

  // ── Stream-specific permission handling ──

  approvePermission(sessionId: string): void {
    const entry = this._pendingPermissions.get(sessionId)
    if (!entry) return

    this._pendingPermissions.delete(sessionId)
    this._store.addSystemMessage(sessionId, entry.formattedDetail)

    const stream = this._sessions.get(sessionId)
    if (stream?.alive) {
      stream.respondPermission(entry.requestId, {
        behavior: 'allow',
        updatedInput: entry.toolInput ?? undefined,
      })
    }

    this._store.process({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })

    entry.resolve({ decision: 'allow' })
  }

  denyPermission(sessionId: string, reason?: string): void {
    const entry = this._pendingPermissions.get(sessionId)
    if (!entry) return

    this._pendingPermissions.delete(sessionId)

    const stream = this._sessions.get(sessionId)
    if (stream?.alive) {
      stream.respondPermission(entry.requestId, { behavior: 'deny', message: reason ?? 'Permission denied.' })
    }

    entry.resolve({ decision: 'deny', reason })
  }

  alwaysAllowPermission(sessionId: string): void {
    this._store.setPermissionMode(sessionId, 'auto')
    this.approvePermission(sessionId)
  }

  interrupt(sessionId: string): void {
    const stream = this._sessions.get(sessionId)
    if (stream?.alive) {
      this._interrupted.add(sessionId)
      stream.interrupt()
    }
  }

  answerPermission(sessionId: string, answer: string): void {
    const entry = this._pendingPermissions.get(sessionId)
    if (!entry) return

    this._pendingPermissions.delete(sessionId)

    const updatedInput = _buildAnswerInput(entry.toolInput, answer)
    this._store.addSystemMessage(sessionId, entry.formattedDetail)

    const stream = this._sessions.get(sessionId)
    if (stream?.alive) {
      stream.respondPermission(entry.requestId, { behavior: 'allow', updatedInput })
    }

    this._store.process({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })

    entry.resolve({ decision: 'allow', updatedInput })
  }

  async destroy(sessionId: string): Promise<void> {
    _cleanupPending(this._pendingPermissions, sessionId)
    this._destroying.add(sessionId)

    const stream = this._sessions.get(sessionId)
    if (!stream) {
      this._destroying.delete(sessionId)
      return
    }

    if (stream.pid) this._managedPids.delete(stream.pid)
    await stream.close(true)
    this._sessions.delete(sessionId)
    this._destroying.delete(sessionId)

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

  // ── Private ──────────────────────────────────────────────────

  private _handleEvent(sessionId: string, event: StreamEvent): void {
    handleStreamEvent(this._store, this._broadcast, sessionId, event, {
      pendingPermissions: this._pendingPermissions,
      subToolParents: this._subToolParents,
      interrupted: this._interrupted,
      destroying: this._destroying,
    })
  }
}

// ── Shared stream event handler ──────────────────────────────

/** Handle a stream event — reusable by local and remote adapters */
export function handleStreamEvent(
  store: SessionStore,
  broadcast: (channel: string, data: unknown) => void,
  sessionId: string,
  event: StreamEvent,
  ctx: StreamEventContext
): void {
  switch (event.type) {
    case 'text': {
      store.updateStreamingAssistant(sessionId, event.content ?? '', false)
      break
    }

    case 'text_delta': {
      store.updateStreamingAssistant(sessionId, event.content ?? '', true)
      break
    }

    case 'tool_use': {
      const toolUseId = event.toolUseId ?? ''
      const parentToolUseId = event.parentToolUseId

      if (parentToolUseId) {
        ctx.subToolParents.set(toolUseId, parentToolUseId)
        store.addSubTool(sessionId, parentToolUseId, toolUseId, event.toolName ?? 'unknown', event.toolInput ?? {})
      } else {
        store.process({
          hook_event_name: 'PreToolUse',
          session_id: sessionId,
          cwd: '',
          payload: {
            tool_use_id: toolUseId,
            tool_name: event.toolName,
            tool_input: event.toolInput,
          },
        })
        store.addToolCall(sessionId, toolUseId, event.toolName ?? 'unknown', event.toolInput ?? {})
      }
      break
    }

    case 'thinking': {
      store.process({
        hook_event_name: 'Notification',
        session_id: sessionId,
        cwd: '',
        payload: { type: 'thinking', content: event.content },
      })
      if (event.content) {
        store.addThinking(sessionId, event.content)
      }
      break
    }

    case 'tool_result': {
      const toolUseId = event.toolUseId
      if (!toolUseId) break
      const status = event.isError ? 'error' : 'success'

      const parentToolUseId = ctx.subToolParents.get(toolUseId)
      if (parentToolUseId) {
        ctx.subToolParents.delete(toolUseId)
        store.updateSubTool(sessionId, parentToolUseId, toolUseId, status, event.content)
      } else {
        store.updateStreamToolCall(sessionId, toolUseId, status, event.content)
      }
      break
    }

    case 'task_lifecycle': {
      const phase = event.taskPhase
      const taskId = event.taskId ?? ''
      const content = event.content ?? ''

      if (phase === 'started') {
        store.addTaskNotification(sessionId, taskId, content)
      } else if (phase === 'progress') {
        store.updateTaskProgress(sessionId, taskId, content)
      } else if (phase === 'completed' || phase === 'failed') {
        store.completeTaskNotification(sessionId, taskId, phase, content)
      }
      break
    }

    case 'post_turn_summary': {
      const title = event.title ?? ''
      const desc = event.content ?? ''
      store.addSystemMessage(sessionId, `📋 ${title}: ${desc}`)
      break
    }

    case 'result': {
      _cleanupPending(ctx.pendingPermissions, sessionId)

      const interrupted = ctx.interrupted.has(sessionId)
      ctx.interrupted.delete(sessionId)

      store.cleanupRunningToolCalls(sessionId)

      store.process({
        hook_event_name: 'Stop',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })

      if (event.durationMs != null || event.inputTokens != null || event.costUsd != null || interrupted) {
        store.addResultSummary(sessionId, {
          durationMs: event.durationMs,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          costUsd: event.costUsd,
          interrupted,
        })
      }
      break
    }

    case 'permission_request': {
      const requestId = event.requestId ?? ''
      const toolName = event.toolName ?? 'unknown'
      const toolInput = event.toolInput ?? null

      _cleanupPending(ctx.pendingPermissions, sessionId)

      new Promise<HookResponse>((resolve) => {
        ctx.pendingPermissions.set(sessionId, {
          requestId,
          toolName,
          toolInput,
          formattedDetail: formatToolDetail(toolName, toolInput),
          resolve,
        })

        store.process({
          hook_event_name: 'PermissionRequest',
          session_id: sessionId,
          cwd: '',
          payload: { toolUseId: requestId, tool: toolName, input: toolInput },
        })
      }).catch((err) => {
        console.error('[stream-adapter] permission handler error:', err)
      })
      break
    }

    case 'session_state': {
      const state = event.state
      if (!state) break
      if (state === 'idle') {
        store.transition(store.get(sessionId)!, 'idle')
      } else if (state === 'running') {
        const session = store.get(sessionId)
        const hasActiveTool = session?.chatItems.some(i => i.type === 'toolCall' && i.tool?.status === 'running')
        store.transition(session!, hasActiveTool ? 'processing' : 'thinking')
      } else if (state === 'requires_action') {
        const hasPendingPerm = ctx.pendingPermissions.has(sessionId)
        const session = store.get(sessionId)
        if (session) {
          store.transition(session, hasPendingPerm ? 'waitingForApproval' : 'waitingForInput')
          broadcast('session:update', {
            sessionId,
            phase: session.phase,
            initMetadata: session.initMetadata,
          })
        }
      }
      break
    }

    case 'session_init': {
      if (event.initMetadata) {
        store.setInitMetadata(sessionId, event.initMetadata)
        broadcast('session:update', { sessionId, initMetadata: event.initMetadata })
      }
      break
    }

    case 'tool_progress': {
      if (event.toolUseId && event.elapsedSeconds != null) {
        store.updateToolProgress(sessionId, event.toolUseId, event.elapsedSeconds)
      }
      break
    }

    case 'tool_summary': {
      if (event.summary) {
        store.addSystemMessage(sessionId, event.summary)
      }
      break
    }

    case 'system_status': {
      const kind = event.statusKind
      if (!kind) break

      const ERROR_LABELS: Record<string, string> = {
        rate_limit: '速率限制',
        server_error: '服务器错误',
        authentication_failed: '认证失败',
        billing_error: '计费错误',
        invalid_request: '无效请求',
        max_output_tokens: '输出长度超限',
        unknown: '未知错误',
      }

      let retryMsg = `API 重试中 (${event.attempt ?? '?'}/${event.maxRetries ?? '?'})`
      if (event.errorMessage) {
        const label = ERROR_LABELS[event.errorMessage] ?? event.errorMessage
        retryMsg += ` — ${label}`
      }
      if (event.errorStatus) {
        retryMsg += ` (HTTP ${event.errorStatus})`
      }

      const messages: Record<string, string> = {
        compacting: '正在压缩上下文...',
        compacted: '上下文压缩完成',
        api_retry: retryMsg,
      }
      store.addSystemStatus(sessionId, kind, messages[kind] ?? kind)
      if (kind === 'compacting') {
        const session = store.get(sessionId)
        if (session) store.transition(session, 'compacting')
      }
      break
    }

    case 'rate_limit': {
      const status = event.rateLimitStatus
      const messages: Record<string, string> = {
        allowed_warning: '接近速率限制',
        rejected: '速率受限，等待恢复中...',
      }
      store.addSystemStatus(sessionId, 'rate_limit', messages[status ?? ''] ?? `速率限制: ${status}`)
      break
    }

    case 'exit': {
      _cleanupPending(ctx.pendingPermissions, sessionId)

      if (ctx.destroying.has(sessionId)) {
        break
      }

      if (event.exitCode === 0) {
        store.process({
          hook_event_name: 'Stop',
          session_id: sessionId,
          cwd: '',
          payload: {},
        })
      } else if (event.exitCode !== null) {
        store.process({
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

// ── Helpers ──────────────────────────────────────────────────

function _cleanupPending(
  pendingPermissions: Map<string, PendingStreamPermission>,
  sessionId: string
): void {
  const pending = pendingPermissions.get(sessionId)
  if (pending) {
    pendingPermissions.delete(sessionId)
    pending.resolve({ decision: 'allow' })
  }
}

function _buildAnswerInput(
  toolInput: Record<string, unknown> | null,
  answer: string
): Record<string, unknown> | undefined {
  if (!toolInput || !Array.isArray(toolInput.questions)) return undefined

  let answerValue: string
  try {
    const parsed = JSON.parse(answer)
    answerValue = Array.isArray(parsed) ? parsed.join(',') : String(parsed)
  } catch {
    answerValue = answer
  }

  const answers: Record<string, string> = {}
  for (const q of toolInput.questions as Array<Record<string, unknown>>) {
    answers[q.question as string] = answerValue
  }

  return { questions: toolInput.questions, answers }
}
