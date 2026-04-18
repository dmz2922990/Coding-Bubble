import { spawn, ChildProcess } from 'child_process'
import * as readline from 'readline'
import { EventEmitter } from 'events'
import type { StreamEvent, StreamSessionOptions, PermissionResult, SkillCommand, PermissionSuggestion } from './types'

export interface StreamSessionEvents {
  event: (event: StreamEvent) => void
}

const MAX_LINE_BYTES = 10 * 1024 * 1024 // 10MB
const INIT_REQUEST_ID = 'init_1'

export class StreamSession {
  private _proc: ChildProcess | null = null
  private _sessionId: string | null = null
  private _writeQueue: Promise<void> = Promise.resolve()
  private _rl: readline.Interface | null = null
  private readonly _emitter = new EventEmitter()
  private _initialized = false

  get sessionId(): string | null {
    return this._sessionId
  }

  get alive(): boolean {
    return this._proc !== null && this._proc.exitCode === null
  }

  get pid(): number | undefined {
    return this._proc?.pid
  }

  on<K extends keyof StreamSessionEvents>(event: K, listener: StreamSessionEvents[K]): void {
    this._emitter.on(event, listener)
  }

  off<K extends keyof StreamSessionEvents>(event: K, listener: StreamSessionEvents[K]): void {
    this._emitter.off(event, listener)
  }

  spawn(options: StreamSessionOptions): void {
    const args: string[] = []

    if (options.sessionId === 'continue') {
      args.push('-c')
    } else if (options.sessionId) {
      args.push('--resume', options.sessionId)
    }

    if (options.bypassPermissions) {
      args.push('--dangerously-skip-permissions')
    }

    if (options.model) {
      args.push('--model', options.model)
    }

    if (options.permissionMode) {
      args.push('--permission-mode', options.permissionMode)
    }

    args.push(
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
      '--verbose',
    )

    console.log(`[stream-json] spawn command: claude ${args.join(' ')} cwd=${options.cwd}`)

    // Filter CLAUDECODE env vars to prevent nested session detection
    const env: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('CLAUDECODE')) {
        env[key] = value
      }
    }
    // Signal hook scripts to skip processing — permissions handled via stream-json
    env['CLAUDE_BUBBLE_SKIP_HOOK'] = '1'

    this._proc = spawn('claude', args, {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._proc.on('error', (err) => {
      this._emit({ type: 'error', error: err })
    })

    this._proc.on('exit', (code, signal) => {
      this._emit({ type: 'exit', exitCode: code, signal })
      this._cleanup()
    })

    // Read stderr for debug logging
    if (this._proc.stderr) {
      this._proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[stream-json] stderr:', chunk.toString('utf-8').trim())
      })
    }

    // Read stdout line by line
    if (this._proc.stdout) {
      this._rl = readline.createInterface({
        input: this._proc.stdout,
        crlfDelay: Infinity,
      })

      let lineBytes = 0
      this._rl.on('line', (line: string) => {
        lineBytes = Buffer.byteLength(line, 'utf-8')
        if (lineBytes > MAX_LINE_BYTES) {
          console.warn(`[stream-json] line exceeded ${MAX_LINE_BYTES} bytes, skipping`)
          return
        }
        this._handleLine(line)
      })
    }

    // Request init metadata via initialize control request
    this._writeJSON({
      type: 'control_request',
      request_id: INIT_REQUEST_ID,
      request: { subtype: 'initialize' },
    })
  }

  send(text: string): void {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
    }
    this._writeJSON(msg)
  }

  interrupt(): void {
    this._writeJSON({
      type: 'control_request',
      request_id: `interrupt_${Date.now()}`,
      request: { subtype: 'interrupt' },
    })
  }

  respondPermission(requestId: string, result: PermissionResult): void {
    const innerResponse: Record<string, unknown> = {
      behavior: result.behavior,
    }

    if (result.behavior === 'allow') {
      // Claude Code requires updatedInput — echo back original input or empty object
      innerResponse.updatedInput = result.updatedInput ?? {}
      if (result.updatedPermissions) {
        innerResponse.updatedPermissions = result.updatedPermissions
      }
    } else if (result.behavior === 'deny') {
      innerResponse.message = result.message ?? 'Permission denied.'
    }

    const resp = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: innerResponse,
      },
    }

    console.log('[stream-json] sending control_response:', JSON.stringify(resp))
    this._writeJSON(resp)
  }

  async close(force: boolean = false): Promise<void> {
    if (!this._proc || this._proc.exitCode !== null) return

    // Phase 1: close stdin, wait up to 3s (reduced from 120s)
    try {
      this._proc.stdin?.end()
      await this._waitExit(force ? 500 : 3_000)
      return
    } catch {
      // timed out, proceed to phase 2
    }

    // Phase 2: SIGTERM, wait 2s (reduced from 5s)
    try {
      this._proc.kill('SIGTERM')
      await this._waitExit(2_000)
      return
    } catch {
      // timed out, proceed to phase 3
    }

    // Phase 3: SIGKILL
    this._proc.kill('SIGKILL')
    await this._waitExit(2_000).catch(() => {})
  }

  // ── Private ──────────────────────────────────────────────

  private _emit(event: StreamEvent): void {
    this._emitter.emit('event', event)
  }

  private _handleLine(line: string): void {
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(line) as Record<string, unknown>
    } catch {
      console.warn('[stream-json] failed to parse JSON line, skipping')
      return
    }

    const eventType = raw.type as string

    switch (eventType) {
      case 'system':
        this._handleSystem(raw)
        break
      case 'assistant':
        this._handleAssistant(raw)
        break
      case 'stream_event':
        this._handleStreamEvent(raw)
        break
      case 'user':
        this._handleUser(raw)
        break
      case 'result':
        this._handleResult(raw)
        break
      case 'control_request':
        this._handleControlRequest(raw)
        break
      case 'control_cancel_request':
        console.log('[stream-json] control_cancel_request:', raw.request_id)
        break
      case 'control_response':
        this._handleControlResponse(raw)
        break
      case 'tool_progress':
        this._handleToolProgress(raw)
        break
      case 'tool_use_summary':
        this._handleToolSummary(raw)
        break
      case 'rate_limit_event':
        this._handleRateLimit(raw)
        break
      default:
        console.log('[stream-json] unknown event type:', eventType)
    }
  }

  private _handleSystem(raw: Record<string, unknown>): void {
    const sid = raw.session_id as string | undefined
    if (sid) this._sessionId = sid

    const subtype = raw.subtype as string | undefined
    switch (subtype) {
      case 'init':
        if (this._initialized) break
        this._initialized = true
        console.log('[stream-json] system init (fallback), session_id:', sid,
          'skills:', Array.isArray(raw.skills) ? (raw.skills as string[]).length : 'N/A',
          'slash_commands:', Array.isArray(raw.slash_commands) ? (raw.slash_commands as string[]).length : 'N/A')
        this._emit({
          type: 'session_init',
          initMetadata: {
            skills: Array.isArray(raw.skills) ? raw.skills as string[] : [],
            slashCommands: Array.isArray(raw.slash_commands) ? raw.slash_commands as string[] : [],
          },
        })
        break
      case 'session_state_changed':
        this._emit({
          type: 'session_state',
          state: raw.state as 'idle' | 'running' | 'requires_action',
        })
        break
      case 'status':
        if (raw.status === 'compacting') {
          this._emit({ type: 'system_status', statusKind: 'compacting' })
        }
        break
      case 'compact_boundary':
        this._emit({ type: 'system_status', statusKind: 'compacted' })
        break
      case 'api_retry':
        this._emit({
          type: 'system_status',
          statusKind: 'api_retry',
          errorMessage: raw.error as string | undefined,
          errorStatus: raw.error_status as number | null | undefined,
          attempt: raw.attempt as number,
          maxRetries: raw.max_retries as number,
          delayMs: raw.retry_delay_ms as number,
        })
        break
      case 'task_started':
        this._emit({
          type: 'task_lifecycle',
          taskPhase: 'started',
          taskId: raw.task_id as string,
          content: raw.description as string,
        })
        break
      case 'task_progress':
        this._emit({
          type: 'task_lifecycle',
          taskPhase: 'progress',
          taskId: raw.task_id as string,
          content: raw.description as string,
        })
        break
      case 'task_notification': {
        const status = raw.status as string
        this._emit({
          type: 'task_lifecycle',
          taskPhase: status === 'completed' ? 'completed' : 'failed',
          taskId: raw.task_id as string,
          content: raw.summary as string,
        })
        break
      }
      case 'post_turn_summary':
        this._emit({
          type: 'post_turn_summary',
          title: raw.title as string,
          content: raw.description as string,
        })
        break
      default:
        break
    }
  }

  private _handleAssistant(raw: Record<string, unknown>): void {
    const message = raw.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!content) return

    const parentToolUseId = (raw.parent_tool_use_id ?? message?.parent_tool_use_id) as string | null | undefined

    for (const block of content) {
      const blockType = block.type as string
      switch (blockType) {
        case 'text':
          this._emit({
            type: 'text',
            content: block.text as string,
            parentToolUseId,
          })
          break
        case 'tool_use':
          this._emit({
            type: 'tool_use',
            toolName: block.name as string,
            toolInput: block.input as Record<string, unknown>,
            toolUseId: block.id as string,
            parentToolUseId,
          })
          break
        case 'thinking':
          this._emit({
            type: 'thinking',
            content: block.thinking as string,
            parentToolUseId,
          })
          break
      }
    }
  }

  private _handleUser(raw: Record<string, unknown>): void {
    const message = raw.message as Record<string, unknown> | undefined
    if (!message) return

    const parentToolUseId = (raw.parent_tool_use_id ?? message.parent_tool_use_id) as string | null | undefined

    const content = message.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'tool_result') {
        this._emit({
          type: 'tool_result',
          toolUseId: block.tool_use_id as string,
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          isError: block.is_error === true,
          parentToolUseId,
        })
      }
    }
  }

  private _handleResult(raw: Record<string, unknown>): void {
    const sid = raw.session_id as string | undefined
    if (sid) this._sessionId = sid

    const usage = raw.usage as Record<string, unknown> | undefined

    this._emit({
      type: 'result',
      content: raw.result as string,
      sessionId: sid ?? this._sessionId ?? undefined,
      done: true,
      subtype: raw.subtype as string | undefined,
      inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : undefined,
      outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : undefined,
      durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : undefined,
      durationApiMs: typeof raw.duration_api_ms === 'number' ? raw.duration_api_ms : undefined,
      costUsd: typeof raw.total_cost_usd === 'number' ? raw.total_cost_usd : undefined,
    })
  }

  private _handleControlRequest(raw: Record<string, unknown>): void {
    const request = raw.request as Record<string, unknown> | undefined
    const subtype = request?.subtype as string | undefined

    if (subtype !== 'can_use_tool') {
      console.log('[stream-json] ignoring control_request subtype:', subtype)
      return
    }

    const rawSuggestions = Array.isArray(request?.permission_suggestions)
      ? request!.permission_suggestions as PermissionSuggestion[]
      : [] as PermissionSuggestion[]

    this._emit({
      type: 'permission_request',
      requestId: raw.request_id as string,
      toolName: request?.tool_name as string,
      toolInput: request?.input as Record<string, unknown>,
      suggestions: rawSuggestions,
    })
  }

  private _handleControlResponse(raw: Record<string, unknown>): void {
    const response = raw.response as Record<string, unknown> | undefined
    const requestId = response?.request_id as string | undefined
    if (requestId !== INIT_REQUEST_ID) return
    if (this._initialized) return

    const inner = response?.response as Record<string, unknown> | undefined
    if (!inner) return

    const commands = Array.isArray(inner.commands)
      ? (inner.commands as Record<string, unknown>[]).filter(c => c && typeof c.name === 'string').map(c => ({
          name: c.name as string,
          description: (c.description as string) ?? '',
          argumentHint: (c.argumentHint as string) ?? '',
        }))
      : [] as SkillCommand[]

    this._initialized = true
    this._emit({
      type: 'session_init',
      initMetadata: {
        skills: [],
        slashCommands: [],
        commands,
      },
    })
  }

  private _handleStreamEvent(raw: Record<string, unknown>): void {
    const event = raw.event as Record<string, unknown> | undefined
    if (!event) return

    const eventType = event.type as string
    if (eventType !== 'content_block_delta') return

    const delta = event.delta as Record<string, unknown> | undefined
    if (delta?.type !== 'text_delta') return

    this._emit({
      type: 'text_delta',
      content: delta.text as string,
    })
  }

  private _handleToolProgress(raw: Record<string, unknown>): void {
    this._emit({
      type: 'tool_progress',
      toolUseId: raw.tool_use_id as string,
      toolName: raw.tool_name as string,
      elapsedSeconds: raw.elapsed_time_seconds as number,
    })
  }

  private _handleToolSummary(raw: Record<string, unknown>): void {
    this._emit({
      type: 'tool_summary',
      summary: raw.summary as string,
    })
  }

  private _handleRateLimit(raw: Record<string, unknown>): void {
    const info = raw.rate_limit_info as Record<string, unknown> | undefined
    this._emit({
      type: 'rate_limit',
      rateLimitStatus: info?.status as string | undefined,
      resetsAt: info?.resetsAt as number | undefined,
    })
  }

  /** Serialized JSON write to stdin — prevents concurrent writes */
  private _writeJSON(obj: Record<string, unknown>): void {
    this._writeQueue = this._writeQueue
      .catch(() => {}) // recover from previous rejection to keep queue alive
      .then(() => {
        return new Promise<void>((resolve, reject) => {
          if (!this._proc?.stdin?.writable) {
            reject(new Error('stdin not writable'))
            return
          }
          const data = JSON.stringify(obj) + '\n'
          this._proc.stdin!.write(data, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      })
      .catch((err) => {
        console.warn('[stream-json] write failed:', (err as Error).message)
      })
  }

  private _waitExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._proc || this._proc.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      this._proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private _cleanup(): void {
    this._rl?.close()
    this._rl = null
    this._proc = null
  }
}
