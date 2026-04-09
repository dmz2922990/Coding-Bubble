import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { HookResponse, Intervention } from '@coding-bubble/session-monitor'

let ballWin: BrowserWindow | null = null
let panelWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null

/** Pending permission resolvers keyed by sessionId */
const pendingPermissionResolvers = new Map<string, { toolUseId: string | undefined; toolName?: string; toolInput?: Record<string, unknown> | null; formattedDetail: string; resolve: (response: HookResponse) => void }>()

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatToolDetail(toolName?: string, toolInput?: Record<string, unknown> | null): string {
  if (!toolName) return '已允许未知工具'
  const input = toolInput ?? {}
  const COLLAPSE_THRESHOLD = 200

  function fmtBody(text: string): string {
    const escaped = escapeHtml(text)
    if (text.length <= COLLAPSE_THRESHOLD) {
      return `<pre class="sys-detail">${escaped}</pre>`
    }
    return `<details><summary>变更详情</summary><pre class="sys-detail">${escaped}</pre></details>`
  }

  /** Build unified diff from old/new strings, matching ApprovalDetail's DiffView */
  function fmtDiff(oldStr: string, newStr: string): string {
    const oldLines = oldStr.split('\n')
    const newLines = newStr.split('\n')

    // Find common prefix
    let prefix = 0
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
      prefix++
    }

    // Find common suffix
    let oEnd = oldLines.length - 1
    let nEnd = newLines.length - 1
    while (oEnd > prefix && nEnd > prefix && oldLines[oEnd] === newLines[nEnd]) {
      oEnd--
      nEnd--
    }

    const lines: Array<{ type: 'ctx' | 'rm' | 'add'; text: string }> = []
    // Show all prefix context lines
    for (let i = 0; i < prefix; i++) {
      lines.push({ type: 'ctx', text: oldLines[i] })
    }
    // Removed lines
    for (let i = prefix; i <= oEnd; i++) {
      lines.push({ type: 'rm', text: oldLines[i] })
    }
    // Added lines
    for (let i = prefix; i <= nEnd; i++) {
      lines.push({ type: 'add', text: newLines[i] })
    }
    // Show all suffix context lines
    for (let i = oEnd + 1; i < oldLines.length; i++) {
      lines.push({ type: 'ctx', text: oldLines[i] })
    }

    const diffHtml = lines.map(l => {
      const marker = l.type === 'rm' ? '-' : l.type === 'add' ? '+' : ' '
      const escaped = escapeHtml(l.text)
      return `<span class="diff-${l.type === 'rm' ? 'rm' : l.type === 'add' ? 'add' : 'ctx'}">${marker} ${escaped}</span>`
    }).join('\n')

    const totalLen = lines.reduce((s, l) => s + l.text.length + 2, 0)
    if (totalLen <= COLLAPSE_THRESHOLD) {
      return `<pre class="sys-detail sys-detail--diff">${diffHtml}</pre>`
    }
    return `<details><summary>变更详情</summary><pre class="sys-detail sys-detail--diff">${diffHtml}</pre></details>`
  }

  switch (toolName) {
    case 'Bash': {
      const cmd = input.command as string ?? ''
      return `已允许: Bash${fmtBody(cmd)}`
    }
    case 'Edit': {
      const file = escapeHtml((input.file_path as string ?? '').split('/').pop() ?? '')
      const oldStr = input.old_string as string ?? ''
      const newStr = input.new_string as string ?? ''
      return `已允许: Edit <code>${file}</code>${fmtDiff(oldStr, newStr)}`
    }
    case 'Write': {
      const file = escapeHtml((input.file_path as string ?? '').split('/').pop() ?? '')
      const content = input.content as string ?? ''
      return `已允许: Write <code>${file}</code>${fmtBody(content)}`
    }
    case 'Read': {
      const file = escapeHtml((input.file_path as string ?? ''))
      return `已允许: Read <code>${file}</code>`
    }
    case 'Grep': {
      const pattern = escapeHtml((input.pattern as string ?? ''))
      const path = escapeHtml((input.path as string ?? ''))
      return `已允许: Grep <code>${pattern}</code> in <code>${path || '(default)'}</code>`
    }
    case 'Glob': {
      const pattern = escapeHtml((input.pattern as string ?? ''))
      return `已允许: Glob <code>${pattern}</code>`
    }
    case 'AskUserQuestion': {
      const questions = input.questions as Array<Record<string, unknown>> | undefined
      const q = questions?.[0]?.question as string ?? ''
      return `已允许: AskUserQuestion${fmtBody(q)}`
    }
    default: {
      const json = JSON.stringify(input)
      return `已允许: ${toolName}${fmtBody(json)}`
    }
  }
}

/** 拖拽时记录光标相对于窗口左上角的偏移量 */
let dragOffset = { x: 0, y: 0 }

/** 计算数据目录：dev 用项目内 data/，prod 用 Application Support */
function resolveDataDir(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'data')
  }
  // dev: 项目根目录 data/（__dirname = apps/desktop/out/main/）
  return join(__dirname, '..', '..', '..', '..', 'data')
}

/** 悬浮球窗口尺寸（含气泡区域） */
const BALL_WIN_W = 240
const BALL_WIN_H = 340

function createBallWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  // 默认位置：球出现在屏幕右下角
  const defaultX = width - 60 - Math.round(BALL_WIN_W / 2)
  const defaultY = height - 60 - (BALL_WIN_H - 36)

  // 从 config 恢复上次位置，超出屏幕则 fallback 到默认
  let x = defaultX
  let y = defaultY
  const saved = readConfig().ballPosition as { x: number; y: number } | undefined
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    const inBounds =
      saved.x >= -BALL_WIN_W / 2 &&
      saved.x <= width - BALL_WIN_W / 2 &&
      saved.y >= 0 &&
      saved.y <= height - 40
    if (inBounds) {
      x = saved.x
      y = saved.y
    }
  }

  ballWin = new BrowserWindow({
    width: BALL_WIN_W,
    height: BALL_WIN_H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sandbox 关闭原因：electron-vite preload 打包依赖 Node.js require 机制
      // 仅通过 contextBridge 暴露最小 IPC 通道，不在渲染进程直接使用 Node API
      sandbox: false
    }
  })

  // floating 层级 — macOS 浮于普通窗口之上不遮挡全屏；Windows 无此层级参数
  if (process.platform === 'darwin') {
    ballWin.setAlwaysOnTop(true, 'floating')
  } else {
    ballWin.setAlwaysOnTop(true)
  }

  // 透明区域点击穿透，forward: true 保留 mousemove 以触发 mouseenter/leave
  ballWin.setIgnoreMouseEvents(true, { forward: true })

  // ── 定时器补偿：系统拖拽(drag-and-drop)期间 forward 不转发 drag 事件，
  //    需要 polling 检测光标是否在球图标区域上方，临时关闭穿透以接收 drop ──
  let pollIgnoring = true // 当前 main 认为的穿透状态
  const POLL_INTERVAL = 80
  const BALL_SIZE = 56
  const pollTimer = setInterval(() => {
    if (!ballWin || ballWin.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const bounds = ballWin.getBounds()
    // 球图标位于窗口底部居中
    const ballCenterX = bounds.x + Math.round(bounds.width / 2)
    const ballCenterY = bounds.y + bounds.height - 8 - Math.round(BALL_SIZE / 2)
    const dx = cursor.x - ballCenterX
    const dy = cursor.y - ballCenterY
    const inBall = dx * dx + dy * dy <= (BALL_SIZE / 2 + 4) * (BALL_SIZE / 2 + 4)
    if (inBall && pollIgnoring) {
      pollIgnoring = false
      ballWin.setIgnoreMouseEvents(false)
    } else if (!inBall && !pollIgnoring) {
      pollIgnoring = true
      ballWin.setIgnoreMouseEvents(true, { forward: true })
    }
  }, POLL_INTERVAL)

  ballWin.on('ready-to-show', () => ballWin?.show())

  ballWin.on('closed', () => {
    clearInterval(pollTimer)
    ballWin = null
  })

  if (process.env['NODE_ENV'] === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    ballWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    ballWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC: 窗口拖拽 ────────────────────────────────────────
ipcMain.on('drag:start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = win.getPosition()
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
})

ipcMain.on('drag:move', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const { x, y } = screen.getCursorScreenPoint()
  win.setPosition(
    Math.round(x - dragOffset.x),
    Math.round(y - dragOffset.y)
  )
})

ipcMain.on('drag:end', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  // Only save position for ball window
  if (win === ballWin) {
    const [bx, by] = win.getPosition()
    const existing = readConfig()
    writeConfig({ ...existing, ballPosition: { x: bx, y: by } })
  }
})

// ── IPC: 透明区域点击穿透 ──────────────────────────────────
ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
  if (!ballWin) return
  if (ignore) {
    ballWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    ballWin.setIgnoreMouseEvents(false)
  }
})

// ── IPC: 调试 ──────────────────────────────────────────────
ipcMain.handle('ipc:ping', () => {
  console.log('[main] received ping from renderer')
  return 'pong from main 🐾'
})

// ── IPC: 打开对话面板 ─────────────────────────────────────
ipcMain.on('panel:open', () => {
  const alreadyOpen = panelWin && !panelWin.isDestroyed()
  createPanelWindow()
  const navigateToChat = (): void => {
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.webContents.send('navigate-to-tab', 'chat')
    }
  }
  if (alreadyOpen) {
    navigateToChat()
  } else {
    panelWin?.webContents.once('did-finish-load', () => {
      setTimeout(navigateToChat, 100)
    })
  }
})

// ── IPC: 右键上下文菜单 ───────────────────────────────────

const PANEL_W = 400
const PANEL_H = 600
const SETTINGS_W = 360
const SETTINGS_H = 420

function createPanelWindow(): void {
  if (panelWin) {
    panelWin.focus()
    return
  }

  // 定位面板在球附近（左上方）
  let x = 100
  let y = 100
  if (ballWin) {
    const ballBounds = ballWin.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: ballBounds.x + Math.round(ballBounds.width / 2),
      y: ballBounds.y + Math.round(ballBounds.height / 2)
    })
    const workArea = display.workArea

    // 面板出现在球的左侧上方，若空间不够则调整
    x = ballBounds.x - PANEL_W - 16
    y = ballBounds.y + ballBounds.height - PANEL_H

    // 防止超出屏幕
    if (x < workArea.x) x = ballBounds.x + ballBounds.width + 16
    if (y < workArea.y) y = workArea.y
    if (x + PANEL_W > workArea.x + workArea.width) x = workArea.x + workArea.width - PANEL_W
    if (y + PANEL_H > workArea.y + workArea.height) y = workArea.y + workArea.height - PANEL_H
  }

  panelWin = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    panelWin.setAlwaysOnTop(true, 'floating')
  } else {
    panelWin.setAlwaysOnTop(true)
  }
  panelWin.on('ready-to-show', () => {
    panelWin?.show()
    bubbleControllerSync()
  })
  panelWin.on('closed', () => {
    panelWin = null
    bubbleControllerSync()
  })

  const panelParam = '?view=panel'
  if (process.env['NODE_ENV'] === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    panelWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + panelParam)
  } else {
    panelWin.loadFile(join(__dirname, '../renderer/index.html'), { search: 'view=panel' })
  }
}

function createSettingsWindow(): void {
  if (settingsWin) {
    settingsWin.focus()
    return
  }

  // 定位在屏幕中央偏上
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  const x = Math.round(workArea.x + (workArea.width - SETTINGS_W) / 2)
  const y = Math.round(workArea.y + (workArea.height - SETTINGS_H) / 3)

  settingsWin = new BrowserWindow({
    width: SETTINGS_W,
    height: SETTINGS_H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    settingsWin.setAlwaysOnTop(true, 'floating')
  } else {
    settingsWin.setAlwaysOnTop(true)
  }
  settingsWin.on('ready-to-show', () => settingsWin?.show())
  settingsWin.on('closed', () => { settingsWin = null })

  const settingsParam = '?view=settings'
  if (process.env['NODE_ENV'] === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    settingsWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + settingsParam)
  } else {
    settingsWin.loadFile(join(__dirname, '../renderer/index.html'), { search: 'view=settings' })
  }
}

ipcMain.on('contextmenu:show', () => {
  if (!ballWin) return

  const menu = Menu.buildFromTemplate([
    {
      label: '打开面板',
      click: () => {
        createPanelWindow()
      }
    },
    {
      label: '设置',
      click: () => {
        createSettingsWindow()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  menu.popup({ window: ballWin })
})

// ── IPC: 关闭当前窗口 ─────────────────────────────────────
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// ── 配置管理 ──────────────────────────────────────────────

function getConfigPath(): string {
  return join(resolveDataDir(), 'config.json')
}

function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(config: Record<string, unknown>): void {
  const configPath = getConfigPath()
  const dir = join(configPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

ipcMain.handle('config:get', () => {
  return readConfig()
})

ipcMain.handle('config:set', (_event, config: Record<string, unknown>) => {
  const existing = readConfig()
  writeConfig({ ...existing, ...config })
})

// ── Session Monitor ──────────────────────────────────────────

import { SessionStore, createSocketServer, installHooks, hooksInstalled, watchJsonlFile, parseFullConversation } from '@coding-bubble/session-monitor'
import type { HookEvent } from '@coding-bubble/session-monitor'
import { TerminalJumper } from '@coding-bubble/session-monitor'

let sessionStore: SessionStore | null = null
const terminalJumper = new TerminalJumper()
const jsonlWatchers = new Map<string, ReturnType<typeof watchJsonlFile>>()

function broadcastToRenderer(channel: string, data: unknown): void {
  console.log('[main] broadcastToRenderer channel:', channel, 'data keys:', data ? Object.keys(data as Record<string, unknown>) : 'no data')
  if (panelWin && !panelWin.isDestroyed()) {
    const payload = typeof data === 'object' && data !== null
      ? { ...(data as Record<string, unknown>), type: channel }
      : data
    panelWin.webContents.send('session:update', payload)
  }
}

// ── IPC: Session Management ─────────────────────────────────

ipcMain.handle('session:list', () => {
  if (!sessionStore) return []
  return Array.from(sessionStore.sessions.values())
})

ipcMain.handle('session:approve', async (_event, sessionId: string) => {
  console.log('[main] ===== session:approve START =====')
  console.log('[main] session:approve called for session:', sessionId)
  console.log('[main] pendingPermissionResolvers keys:', [...pendingPermissionResolvers.keys()])

  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) {
    console.error('[main] session:approve FAILED - no pending resolver for session:', sessionId)
    console.error('[main] Available sessions in sessionStore:', sessionStore ? [...sessionStore.sessions.keys()] : 'no sessionStore')
    return
  }

  console.log('[main] Found entry:', { toolUseId: entry.toolUseId })
  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = { decision: 'allow' }
  console.log('[main] Resolving with response:', JSON.stringify(response))

  sessionStore?.addSystemMessage(sessionId, entry.formattedDetail)

  // Update sessionStore phase state
  if (entry.toolUseId) {
    console.log('[main] calling sessionStore.resolvePermission for toolUseId:', entry.toolUseId)
    await sessionStore?.resolvePermission(entry.toolUseId, response)
  }

  try {
    console.log('[main] About to call entry.resolve()...')
    entry.resolve(response)
    console.log('[main] entry.resolve() completed successfully')
  } catch (err) {
    console.error('[main] Error during resolve:', err)
  }

  console.log('[main] ===== session:approve END =====')
})

ipcMain.handle('session:deny', async (_event, sessionId: string, reason?: string) => {
  console.log('[main] session:deny', sessionId, 'pending keys:', [...pendingPermissionResolvers.keys()])
  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) return
  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = { decision: 'deny', reason }
  if (entry.toolUseId) {
    sessionStore?.resolvePermission(entry.toolUseId, response)
  }
  entry.resolve(response)
})

ipcMain.handle('session:always-allow', async (_event, sessionId: string) => {
  console.log('[main] ===== session:always-allow START =====')
  console.log('[main] session:always-allow called for session:', sessionId)

  // Set session permission mode to 'auto' for future auto-allow
  sessionStore?.setPermissionMode(sessionId, 'auto')

  // Also approve the current pending permission
  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) {
    console.error('[main] session:always-allow FAILED - no pending resolver for session:', sessionId)
    return
  }

  console.log('[main] Found entry:', { toolUseId: entry.toolUseId })
  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = { decision: 'allow' }
  console.log('[main] Resolving with response:', JSON.stringify(response))

  sessionStore?.addSystemMessage(sessionId, entry.formattedDetail)

  try {
    console.log('[main] About to call entry.resolve()...')
    entry.resolve(response)
    console.log('[main] entry.resolve() completed successfully')
  } catch (err) {
    console.error('[main] Error during resolve:', err)
  }

  console.log('[main] ===== session:always-allow END =====')
})

ipcMain.handle('session:answer', async (_event, sessionId: string, answer: string) => {
  console.log('[main] ===== session:answer START =====')
  console.log('[main] session:answer called for session:', sessionId, 'answer:', answer)

  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) {
    console.error('[main] session:answer FAILED - no pending resolver for session:', sessionId)
    return
  }

  console.log('[main] Found entry:', { toolUseId: entry.toolUseId })
  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = { decision: 'allow' }

  // Build updatedInput with answers for AskUserQuestion
  if (entry.toolInput && Array.isArray(entry.toolInput.questions)) {
    let answerValue: string
    try {
      const parsed = JSON.parse(answer)
      answerValue = Array.isArray(parsed) ? parsed.join(',') : String(parsed)
    } catch {
      answerValue = answer
    }

    const answers: Record<string, string> = {}
    for (const q of entry.toolInput.questions as Array<Record<string, unknown>>) {
      answers[q.question as string] = answerValue
    }

    response.updatedInput = {
      questions: entry.toolInput.questions,
      answers
    }
  }

  console.log('[main] Resolving with response:', JSON.stringify(response))

  sessionStore?.addSystemMessage(sessionId, entry.formattedDetail)

  if (entry.toolUseId) {
    await sessionStore?.resolvePermission(entry.toolUseId, response)
  }

  try {
    console.log('[main] About to call entry.resolve()...')
    entry.resolve(response)
    console.log('[main] entry.resolve() completed successfully')
  } catch (err) {
    console.error('[main] Error during resolve:', err)
  }

  console.log('[main] ===== session:answer END =====')
})

ipcMain.handle('session:hooks-status', () => {
  return { installed: hooksInstalled() }
})

ipcMain.handle('session:install-hooks', () => {
  installHooks()
  console.log('[main] hooks installed')
})

ipcMain.handle('session:jump-to-terminal', async (_event, sessionId: string) => {
  if (!sessionStore) return { success: false, error: 'Session store not initialized' }
  const session = sessionStore.get(sessionId)
  if (!session) return { success: false, error: 'Session not found' }
  return terminalJumper.jump(session)
})

// ── IPC: Bubble Navigation ─────────────────────────────────

ipcMain.on('panel:navigate-to-session', (_event, sessionId: string) => {
  const sendNavigate = (): void => {
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.webContents.send('navigate-to-tab', sessionId)
    }
  }

  if (!panelWin || panelWin.isDestroyed()) {
    createPanelWindow()
    // Wait for renderer to load before sending navigation command
    panelWin?.webContents.once('did-finish-load', () => sendNavigate())
  } else {
    if (!panelWin.isVisible()) panelWin.show()
    sendNavigate()
  }

  // Hide bubble after navigation
  if (ballWin && !ballWin.isDestroyed()) {
    ballWin.webContents.send('bubble:hide')
  }
})

// ── BubbleController ──────────────────────────────────────────

function bubbleControllerSync(): void {
  if (!ballWin || ballWin.isDestroyed()) return
  const notifications = sessionStore?.getPendingNotifications() ?? []
  const panelVisible = panelWin !== null && !panelWin.isDestroyed() && panelWin.isVisible()

  if (!panelVisible && notifications.length > 0) {
    ballWin.webContents.send('bubble:show', notifications)
  } else {
    ballWin.webContents.send('bubble:hide')
  }
}

// ── App 生命周期 ───────────────────────────────────────────
app.whenReady().then(() => {
  try {
    installHooks()
  } catch (err) {
    console.error('[main] hook install failed:', err)
  }

  sessionStore = new SessionStore()
  sessionStore.onPublish((channel: string, data: unknown) => broadcastToRenderer(channel, data))

  sessionStore.onInterventionChange(() => {
    bubbleControllerSync()
  })

  sessionStore.onNotificationChange(() => {
    bubbleControllerSync()
  })

  createSocketServer({
    onEvent: (event: HookEvent) => {
      console.log('[main] socket onEvent:', JSON.stringify(event))

      // Before processing the event, check if pending permissions are stale
      // This handles the case where Stop event arrives while waiting for permission
      if (event.session_id) {
        const session = sessionStore?.get(event.session_id)
        const pending = pendingPermissionResolvers.get(event.session_id)
        if (pending && session && session.phase.type !== 'waitingForApproval') {
          console.log('[main] clearing stale pending permission for session:', event.session_id, 'due to:', event.hook_event_name, 'phase:', session.phase.type)
          pendingPermissionResolvers.delete(event.session_id)
          // Only resolve the pending callback, don't call sessionStore.resolvePermission
          // Let the event processing handle the state transition naturally
          pending.resolve({ decision: 'allow' })
        }
      }

      sessionStore?.process(event)

      // Start JSONL watcher on session start
      if (event.hook_event_name === 'SessionStart' && event.session_id) {
        if (!jsonlWatchers.has(event.session_id) && event.cwd) {
          const watcher = watchJsonlFile(event.session_id, event.cwd, (sessionId: string, items: unknown[]) => {
            sessionStore?.process({
              hook_event_name: 'fileUpdated',
              session_id: sessionId,
              cwd: '',
              payload: { chatItems: items }
            } as HookEvent)
          })
          jsonlWatchers.set(event.session_id, watcher)

          // Also parse full conversation on first load
          const fullItems = parseFullConversation(event.session_id, event.cwd)
          if (fullItems.length > 0) {
            sessionStore?.process({
              hook_event_name: 'fileUpdated',
              session_id: event.session_id,
              cwd: '',
              payload: { chatItems: fullItems }
            } as HookEvent)
          }
        }
      }

      // Clean up watcher on session end
      if (event.hook_event_name === 'SessionEnd' && event.session_id) {
        const watcher = jsonlWatchers.get(event.session_id)
        if (watcher) {
          watcher.stop()
          jsonlWatchers.delete(event.session_id)
        }
      }
    },
    onPermissionRequest: async (sessionId: string, toolUseId: string, toolName: string, toolInput: Record<string, unknown> | null): Promise<HookResponse> => {
      // Check session permission mode - only prompt user if mode is 'default'
      const session = sessionStore?.sessions.get(sessionId)
      const permissionMode = session?.permissionMode ?? 'auto'

      console.log('[main] onPermissionRequest sessionId:', sessionId, 'permissionMode:', permissionMode)

      if (permissionMode !== 'default') {
        // Auto-allow for non-default modes
        console.log('[main] auto-allow for permissionMode:', permissionMode)
        return { decision: 'allow' }
      }

      // Wait for user approval
      return new Promise<HookResponse>((resolve) => {
        pendingPermissionResolvers.set(sessionId, { toolUseId, toolName, toolInput, formattedDetail: formatToolDetail(toolName, toolInput), resolve })
        sessionStore?.process({
          hook_event_name: 'PermissionRequest',
          session_id: sessionId,
          cwd: '',
          payload: { toolUseId, tool: toolName, input: toolInput }
        } as HookEvent)
      })
    }
  })

  createBallWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBallWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
