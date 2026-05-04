import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import type { HookResponse, Intervention, PermissionSuggestion } from '@coding-bubble/session-monitor'
import { RemoteManager, RemoteHookAdapter, RemoteStreamAdapter, parseRemoteSessionId } from '@coding-bubble/remote'

app.setName('Coding-bubble')
import type { RemoteServerConfig } from '@coding-bubble/remote'
import { formatToolDetail } from './format-tool-detail'

let ballWin: BrowserWindow | null = null
let panelWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let notificationWin: BrowserWindow | null = null
let tray: Tray | null = null
let ballVisible = true

/** Pending permission resolvers keyed by sessionId — for hook sessions only */
const pendingPermissionResolvers = new Map<string, { toolUseId: string | undefined; toolName?: string; toolInput?: Record<string, unknown> | null; formattedDetail: string; suggestions?: PermissionSuggestion[]; resolve: (response: HookResponse) => void }>()

/** 拖拽时记录光标相对于窗口左上角的偏移量 */
let dragOffset = { x: 0, y: 0 }

/** Last measured notification content size (used during drag to reposition) */
let lastNotifSize = { width: 0, height: 0 }

/** Push bubble alignment side to notification renderer based on ball window position */
function sendBubbleSide(): void {
  if (!ballWin || ballWin.isDestroyed()) return
  const bounds = ballWin.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea
  const ballCenterX = bounds.x + Math.round(bounds.width / 2)
  const side: 'left' | 'right' = ballCenterX < workArea.x + workArea.width / 2 ? 'left' : 'right'
  if (notificationWin && !notificationWin.isDestroyed()) {
    notificationWin.webContents.send('bubble:side', side)
  }
}

/** Calculate notification window position above the ball */
function positionNotificationWin(contentWidth: number, contentHeight: number): void {
  lastNotifSize = { width: contentWidth, height: contentHeight }
  if (!notificationWin || notificationWin.isDestroyed()) return
  if (!ballWin || ballWin.isDestroyed()) return

  const ballBounds = ballWin.getBounds()
  const display = screen.getDisplayMatching(ballBounds)
  const workArea = display.workArea
  const ballCenterX = ballBounds.x + Math.round(ballBounds.width / 2)
  const onLeft = ballCenterX < workArea.x + workArea.width / 2

  const BALL_SIZE = 56
  const ballIconBottom = ballBounds.y + ballBounds.height - 8
  const ballIconCenterX = ballBounds.x + Math.round(ballBounds.width / 2)
  const ballIconLeft = ballIconCenterX - Math.round(BALL_SIZE / 2)
  const ballIconRight = ballIconCenterX + Math.round(BALL_SIZE / 2)

  const GAP = 8
  const winH = contentHeight + 4
  const winW = contentWidth + 4

  let x: number
  if (onLeft) {
    x = ballIconLeft - 2
  } else {
    x = ballIconRight - winW + 2
  }
  let y = ballIconBottom - BALL_SIZE - GAP - winH

  if (x < workArea.x) x = workArea.x
  if (x + winW > workArea.x + workArea.width) x = workArea.x + workArea.width - winW
  if (y < workArea.y) y = workArea.y

  notificationWin.setBounds({ x, y, width: winW, height: winH })
}

function createNotificationWindow(): void {
  if (notificationWin && !notificationWin.isDestroyed()) {
    notificationWin.showInactive()
    return
  }

  notificationWin = new BrowserWindow({
    width: 1,
    height: 1,
    x: -9999,
    y: -9999,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    notificationWin.setAlwaysOnTop(true, 'floating')
  } else {
    notificationWin.setAlwaysOnTop(true)
  }

  notificationWin.on('closed', () => {
    notificationWin = null
  })

  notificationWin.on('ready-to-show', () => {
    notificationWin?.showInactive()
    sendBubbleSide()
  })

  const notifParam = '?view=notification'
  if (process.env['NODE_ENV'] === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    notificationWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + notifParam)
  } else {
    notificationWin.loadFile(join(__dirname, '../renderer/index.html'), { search: 'view=notification' })
  }
}

function closeNotificationWindow(): void {
  if (notificationWin && !notificationWin.isDestroyed()) {
    notificationWin.close()
  }
  notificationWin = null
}

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
    focusable: false,
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

  // ── Polling: detect cursor over ball icon area, toggle click-through ──
  // macOS: setIgnoreMouseEvents(true, { forward: true }) forwards mousemove,
  //        so mouseenter/mouseleave handle most cases. Polling is a backup.
  // Windows: { forward: true } has no effect, so polling is the primary mechanism.
  let pollIgnoring = true
  let holdNonIgnoringUntil = 0 // Lock click-through off after mousedown for reliable double-click
  const POLL_INTERVAL = 20
  const BALL_SIZE = 56
  const pollTimer = setInterval(() => {
    if (!ballWin || ballWin.isDestroyed() || !ballVisible) return
    const now = Date.now()
    const cursor = screen.getCursorScreenPoint()
    const bounds = ballWin.getBounds()
    // Ball icon is at bottom center of window
    const ballCenterX = bounds.x + Math.round(bounds.width / 2)
    const ballCenterY = bounds.y + bounds.height - 8 - Math.round(BALL_SIZE / 2)
    const dx = cursor.x - ballCenterX
    const dy = cursor.y - ballCenterY
    const inBall = dx * dx + dy * dy <= (BALL_SIZE / 2 + 4) * (BALL_SIZE / 2 + 4)
    if ((inBall || now < holdNonIgnoringUntil) && pollIgnoring) {
      pollIgnoring = false
      ballWin.setIgnoreMouseEvents(false)
    } else if (!inBall && !pollIgnoring && now >= holdNonIgnoringUntil) {
      pollIgnoring = true
      ballWin.setIgnoreMouseEvents(true, { forward: true })
    }
  }, POLL_INTERVAL)

  // When renderer detects mousedown on ball, lock click-through off briefly
  // to ensure the double-click sequence completes without being interrupted by polling
  ipcMain.on('ball:hold-clickable', () => {
    holdNonIgnoringUntil = Date.now() + 600
  })

  ballWin.on('ready-to-show', () => {
    ballWin?.showInactive()
    sendBubbleSide()
  })

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
  sendBubbleSide()
  positionNotificationWin(lastNotifSize.width, lastNotifSize.height)
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
  sendBubbleSide()
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

// ── IPC: notification window resize ───────────────────────
ipcMain.on('notification:resize', (_event, width: number, height: number) => {
  positionNotificationWin(width, height)
})

// ── IPC: 调试 ──────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion())

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

function buildAppMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '打开面板',
      click: () => createPanelWindow()
    },
    {
      label: ballVisible ? '隐藏悬浮球' : '显示悬浮球',
      click: () => toggleBallVisibility()
    },
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    {
      label: '关于',
      click: () => openSettingsToTab('about')
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])
}

function toggleBallVisibility(): void {
  if (!ballWin || ballWin.isDestroyed()) return
  ballVisible = !ballVisible
  if (ballVisible) {
    ballWin.showInactive()
  } else {
    ballWin.hide()
  }
  tray?.setContextMenu(buildAppMenu())
}

const PANEL_W = 400
const PANEL_H = 600
const SETTINGS_W = 360
const SETTINGS_H = 520

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
    hasShadow: process.platform !== 'darwin',
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

  // Right-click context menu for text selection
  panelWin.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []
    if (params.selectionText) {
      menuItems.push({ label: '拷贝', role: 'copy' })
    }
    if (params.isEditable) {
      if (params.selectionText) {
        menuItems.push({ label: '剪切', role: 'cut' })
      }
      menuItems.push({ label: '粘贴', role: 'paste' })
    }
    if (params.selectionText || params.isEditable) {
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: '全选', role: 'selectAll' })
    }
    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: panelWin! })
    }
  })

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

function createSettingsWindow(tab?: string): void {
  if (settingsWin) {
    settingsWin.focus()
    if (tab) {
      settingsWin.webContents.send('settings:navigate-to-tab', tab)
    }
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

  if (tab) {
    settingsWin.webContents.once('did-finish-load', () => {
      settingsWin?.webContents.send('settings:navigate-to-tab', tab)
    })
  }
}

function openSettingsToTab(tab: string): void {
  createSettingsWindow(tab)
}

ipcMain.on('contextmenu:show', () => {
  if (!ballWin) return
  buildAppMenu().popup({ window: ballWin })
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

ipcMain.handle('notification:get-config', () => {
  const defaultAutoClose: NotificationAutoCloseConfig = { approval: 0, error: 30, input: 15, done: 15, quickApproval: true }
  const savedAutoClose = readConfig().notificationAutoClose as NotificationAutoCloseConfig | undefined
  return savedAutoClose ? { ...defaultAutoClose, ...savedAutoClose } : defaultAutoClose
})

ipcMain.handle('notification:set-config', (_event, config: NotificationAutoCloseConfig) => {
  const existing = readConfig()
  writeConfig({ ...existing, notificationAutoClose: config })
  sessionStore?.updateNotificationConfig(config)
})

ipcMain.on('notification:dismiss', (_event, sessionId: string) => {
  sessionStore?.dismissNotification(sessionId)
})

ipcMain.handle('dialog:showOpenDialog', async (_event, options: Electron.OpenDialogOptions) => {
  return dialog.showOpenDialog(options)
})

ipcMain.handle('local:list-directory', async (_event, dirPath?: string) => {
  const target = dirPath ? dirPath.replace(/^~/, app.getPath('home')) : app.getPath('home')
  try {
    const entries = readdirSync(target, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: join(target, e.name), type: 'directory' }))
  } catch {
    return []
  }
})

ipcMain.handle('dialog:saveMarkdown', async (_event, content: string, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return { success: false }
  writeFileSync(result.filePath, content, 'utf-8')
  return { success: true, path: result.filePath }
})

// ── Session Monitor ──────────────────────────────────────────

import { SessionStore, HistoryStore, createSocketServer, installHooks, hooksInstalled, watchJsonlFile, parseFullConversation } from '@coding-bubble/session-monitor'
import type { NotificationAutoCloseConfig } from '@coding-bubble/session-monitor'
import type { HookEvent } from '@coding-bubble/session-monitor'
import { TerminalJumper } from '@coding-bubble/session-monitor'
import { StreamAdapterManager, handleStreamEvent } from './stream-adapter'
import type { StreamEventContext } from './stream-adapter'

let sessionStore: SessionStore | null = null
let historyStore: HistoryStore | null = null
let streamManager: StreamAdapterManager | null = null
let remoteManager: RemoteManager | null = null
let remoteHookAdapter: RemoteHookAdapter | null = null
let remoteStreamAdapter: RemoteStreamAdapter | null = null

/** Map internal sessionId -> serverId for remote sessions */
const remoteSessionServerMap = new Map<string, string>()
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

ipcMain.handle('history:query', (_event, page: number = 1, pageSize: number = 20) => {
  if (!historyStore) return { entries: [], totalCount: 0 }
  return historyStore.query(page, pageSize)
})

ipcMain.handle('session:approve', async (_event, sessionId: string) => {
  console.log('[main] ===== session:approve START =====')
  console.log('[main] session:approve called for session:', sessionId)

  // Route remote-hook sessions to remote hook adapter
  const parsed = parseRemoteSessionId(sessionId)
  if (parsed && remoteHookAdapter) {
    const toolUseId = remoteHookAdapter.getPendingToolUseId(sessionId)
    if (toolUseId) {
      remoteHookAdapter.approvePermission(parsed.serverId, sessionId, toolUseId)
    }
    return
  }
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

  // Route remote-hook sessions to remote hook adapter
  const parsed = parseRemoteSessionId(sessionId)
  if (parsed && remoteHookAdapter) {
    const toolUseId = remoteHookAdapter.getPendingToolUseId(sessionId)
    if (toolUseId) {
      remoteHookAdapter.denyPermission(parsed.serverId, sessionId, toolUseId, reason)
    }
    return
  }

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

  // Route remote-hook sessions to remote hook adapter
  const parsedAlwaysAllow = parseRemoteSessionId(sessionId)
  if (parsedAlwaysAllow && remoteHookAdapter) {
    const toolUseId = remoteHookAdapter.getPendingToolUseId(sessionId)
    if (toolUseId) {
      remoteHookAdapter.approvePermission(parsedAlwaysAllow.serverId, sessionId, toolUseId)
    }
    return
  }

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

  // Route remote-hook sessions to remote hook adapter
  const parsedAnswer = parseRemoteSessionId(sessionId)
  if (parsedAnswer && remoteHookAdapter) {
    const toolUseId = remoteHookAdapter.getPendingToolUseId(sessionId)
    if (toolUseId) {
      const session = sessionStore?.get(sessionId)
      const toolInput = (session?.phase as { context?: { toolInput?: Record<string, unknown> } })?.context?.toolInput
      const response: HookResponse = { decision: 'allow' }
      if (toolInput && Array.isArray(toolInput.questions)) {
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
        response.updatedInput = { questions: toolInput.questions, answers }
      }
      remoteHookAdapter.answerPermission(parsedAnswer.serverId, sessionId, toolUseId, response)
      sessionStore?.resolvePermission(toolUseId, response)
    }
    return
  }

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

ipcMain.handle('session:suggestion', async (_event, sessionId: string, index: number) => {
  // Route remote-hook sessions to remote hook adapter
  const parsedRemote = parseRemoteSessionId(sessionId)
  if (parsedRemote && remoteHookAdapter) {
    const toolUseId = remoteHookAdapter.getPendingToolUseId(sessionId)
    if (toolUseId) {
      remoteHookAdapter.suggestionPermission(parsedRemote.serverId, sessionId, toolUseId, index)
    }
    return
  }

  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) {
    console.error('[main] session:suggestion FAILED - no pending resolver for session:', sessionId)
    return
  }

  const suggestion = entry.suggestions?.[index]
  if (!suggestion) {
    console.error('[main] session:suggestion FAILED - no suggestion at index:', index)
    return
  }

  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = {
    decision: 'allow',
    updatedPermissions: [suggestion],
  }

  sessionStore?.addSystemMessage(sessionId, entry.formattedDetail)
  sessionStore?.process({
    hook_event_name: 'PostToolUse',
    session_id: sessionId,
    cwd: '',
    payload: {},
  })

  entry.resolve(response)
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

// ── IPC: Stream Session Management ────────────────────────────

ipcMain.handle('stream:create', async (_event, cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }) => {
  if (!streamManager) return { error: 'Stream manager not initialized' }
  try {
    const sessionId = await streamManager.create(cwd, undefined, options)
    return { sessionId }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('stream:send', async (_event, sessionId: string, text: string) => {
  if (!streamManager) return { error: 'Stream manager not initialized' }
  try {
    streamManager.send(sessionId, text)
    return { success: true }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('stream:destroy', async (_event, sessionId: string) => {
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    remoteSessionServerMap.delete(sessionId)
    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    remoteCtx?.destroying.add(sessionId)
    await remoteStreamAdapter.destroy(serverId, sessionId)
    sessionStore?.process({
      hook_event_name: 'SessionEnd',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })
    return
  }
  if (!streamManager) return
  await streamManager.destroy(sessionId)
})

ipcMain.handle('stream:resume', async (_event, claudeSessionId: string, cwd: string) => {
  if (!streamManager) return { error: 'Stream manager not initialized' }
  try {
    const sessionId = await streamManager.resume(claudeSessionId, cwd)
    return { sessionId }
  } catch (err) {
    return { error: String(err) }
  }
})

// ── IPC: Stream Permission Handling (independent from hooks) ──────

ipcMain.handle('stream:approve', async (_event, sessionId: string) => {
  // Route remote-stream sessions
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    const session = sessionStore?.get(sessionId)
    const requestId = session?.phase.type === 'waitingForApproval'
      ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
      : undefined
    if (requestId) {
      const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
      const pending = remoteCtx?.pendingPermissions.get(sessionId)
      if (pending) {
        remoteCtx.pendingPermissions.delete(sessionId)
        sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
        pending.resolve({ decision: 'allow' })
      }
      remoteStreamAdapter.approvePermission(serverId, sessionId, requestId)
      sessionStore?.process({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })
    }
    return
  }
  if (!streamManager) return
  streamManager.approvePermission(sessionId)
})

ipcMain.handle('stream:deny', async (_event, sessionId: string, reason?: string) => {
  // Route remote-stream sessions
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    const session = sessionStore?.get(sessionId)
    const requestId = session?.phase.type === 'waitingForApproval'
      ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
      : undefined
    if (requestId) {
      const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
      const pending = remoteCtx?.pendingPermissions.get(sessionId)
      if (pending) {
        sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
        remoteCtx.pendingPermissions.delete(sessionId)
        pending.resolve({ decision: 'deny', reason })
      }
      remoteStreamAdapter.denyPermission(serverId, sessionId, requestId, reason)
      sessionStore?.process({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })
    }
    return
  }
  if (!streamManager) return
  streamManager.denyPermission(sessionId, reason)
})

ipcMain.handle('stream:always-allow', async (_event, sessionId: string) => {
  // Route remote-stream sessions
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    sessionStore?.setPermissionMode(sessionId, 'auto')
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    const session = sessionStore?.get(sessionId)
    const requestId = session?.phase.type === 'waitingForApproval'
      ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
      : undefined
    if (requestId) {
      const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
      const pending = remoteCtx?.pendingPermissions.get(sessionId)
      if (pending) {
        remoteCtx.pendingPermissions.delete(sessionId)
        sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
        pending.resolve({ decision: 'allow' })
      }
      remoteStreamAdapter.approvePermission(serverId, sessionId, requestId)
      sessionStore?.process({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })
    }
    return
  }
  if (!streamManager) return
  streamManager.alwaysAllowPermission(sessionId)
})

ipcMain.handle('stream:answer', async (_event, sessionId: string, answer: string) => {
  // Route remote-stream sessions
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    const session = sessionStore?.get(sessionId)
    const requestId = session?.phase.type === 'waitingForApproval'
      ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
      : undefined
    if (!requestId) return

    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    const pending = remoteCtx?.pendingPermissions.get(sessionId)
    if (pending) {
      remoteCtx.pendingPermissions.delete(sessionId)
      sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
      // Build answer input for AskUserQuestion
      let updatedInput: Record<string, unknown> | undefined
      if (pending.toolInput && Array.isArray(pending.toolInput.questions)) {
        let answerValue: string
        try {
          const parsed = JSON.parse(answer)
          answerValue = Array.isArray(parsed) ? parsed.join(',') : String(parsed)
        } catch {
          answerValue = answer
        }
        const answers: Record<string, string> = {}
        for (const q of pending.toolInput.questions as Array<Record<string, unknown>>) {
          answers[q.question as string] = answerValue
        }
        updatedInput = { questions: pending.toolInput.questions, answers }
      }
      pending.resolve({ decision: 'allow', updatedInput })
      sessionStore?.process({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: '',
        payload: {},
      })
    }
    remoteStreamAdapter.approvePermission(serverId, sessionId, requestId)
    return
  }

  if (!streamManager) return
  streamManager.answerPermission(sessionId, answer)
})

ipcMain.handle('stream:suggestion', async (_event, sessionId: string, index: number) => {
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    remoteStreamAdapter.suggestionPermission(serverId, sessionId, index)
    return
  }

  if (!streamManager) return
  streamManager.suggestionPermission(sessionId, index)
})

ipcMain.handle('stream:interrupt', async (_event, sessionId: string) => {
  if (sessionId.startsWith('remote:')) {
    if (!remoteStreamAdapter) return
    const serverId = remoteSessionServerMap.get(sessionId)
    if (!serverId) return
    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    remoteCtx?.interrupted.add(sessionId)
    remoteStreamAdapter.interrupt(serverId, sessionId)
    return
  }
  if (!streamManager) return
  streamManager.interrupt(sessionId)
})

// ── IPC: Remote Management ──────────────────────────────────────

ipcMain.handle('remote:connect', async (_event, serverId: string) => {
  remoteManager?.connect(serverId)
})

ipcMain.handle('remote:disconnect', async (_event, serverId: string) => {
  remoteManager?.disconnect(serverId)
})

ipcMain.handle('remote:list-servers', async () => {
  return remoteManager?.getConnections() ?? []
})

ipcMain.handle('remote:add-server', async (_event, config: Record<string, unknown>) => {
  if (!remoteManager) return
  const serverConfig = config as unknown as RemoteServerConfig
  remoteManager.addServer(serverConfig)
  // Persist to config
  const conf = readConfig()
  const servers = (conf.remoteServers as RemoteServerConfig[] | undefined) ?? []
  const existing = servers.findIndex(s => s.id === serverConfig.id)
  if (existing >= 0) {
    servers[existing] = serverConfig
  } else {
    servers.push(serverConfig)
  }
  conf.remoteServers = servers
  writeConfig(conf)
})

ipcMain.handle('remote:remove-server', async (_event, serverId: string) => {
  if (!remoteManager) return
  remoteManager.removeServer(serverId)
  // Persist to config
  const conf = readConfig()
  const servers = ((conf.remoteServers as RemoteServerConfig[] | undefined) ?? [])
    .filter(s => s.id !== serverId)
  conf.remoteServers = servers
  writeConfig(conf)
})

ipcMain.handle('remote:list-directory', async (_event, serverId: string, dirPath?: string) => {
  if (!remoteManager) return []
  return remoteManager.listDirectory(serverId, dirPath)
})

ipcMain.handle('remote:stream:create', async (_event, serverId: string, cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }) => {
  console.log('[main] remote:stream:create', { serverId, cwd, options })
  if (!remoteStreamAdapter) return { error: 'Remote not initialized' }
  try {
    const sessionId = await remoteStreamAdapter.create(serverId, cwd, options?.continue ? 'continue' : undefined, options)
    remoteSessionServerMap.set(sessionId, serverId)
    return { sessionId }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('remote:stream:send', async (_event, sessionId: string, text: string) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  // Add user message to SessionStore so it shows in the chat
  sessionStore?.process({
    hook_event_name: 'UserPromptSubmit',
    session_id: sessionId,
    cwd: '',
    payload: { prompt: text },
  })
  remoteStreamAdapter.send(serverId, sessionId, text)
})

ipcMain.handle('remote:stream:approve', async (_event, sessionId: string) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  const session = sessionStore?.get(sessionId)
  const requestId = session?.phase.type === 'waitingForApproval'
    ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
    : undefined
  if (requestId) {
    // Clean up shared ctx pending permission and resolve its promise
    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    const pending = remoteCtx?.pendingPermissions.get(sessionId)
    if (pending) {
      remoteCtx.pendingPermissions.delete(sessionId)
      sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
      pending.resolve({ decision: 'allow' })
    }
    remoteStreamAdapter.approvePermission(serverId, sessionId, requestId)
    sessionStore?.process({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })
  }
})

ipcMain.handle('remote:stream:deny', async (_event, sessionId: string, reason?: string) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  const session = sessionStore?.get(sessionId)
  const requestId = session?.phase.type === 'waitingForApproval'
    ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
    : undefined
  if (requestId) {
    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    const pending = remoteCtx?.pendingPermissions.get(sessionId)
    if (pending) {
      sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
      remoteCtx.pendingPermissions.delete(sessionId)
      pending.resolve({ decision: 'deny', reason })
    }
    remoteStreamAdapter.denyPermission(serverId, sessionId, requestId, reason)
    sessionStore?.process({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })
  }
})

ipcMain.handle('remote:stream:always-allow', async (_event, sessionId: string) => {
  if (!remoteStreamAdapter) return
  sessionStore?.setPermissionMode(sessionId, 'auto')
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  const session = sessionStore?.get(sessionId)
  const requestId = session?.phase.type === 'waitingForApproval'
    ? (session.phase as { context: { toolUseId: string } }).context?.toolUseId
    : undefined
  if (requestId) {
    const remoteCtx = (globalThis as unknown as Record<string, StreamEventContext>).__remoteStreamCtx
    const pending = remoteCtx?.pendingPermissions.get(sessionId)
    if (pending) {
      remoteCtx.pendingPermissions.delete(sessionId)
      sessionStore?.addSystemMessage(sessionId, pending.formattedDetail)
      pending.resolve({ decision: 'allow' })
    }
    remoteStreamAdapter.approvePermission(serverId, sessionId, requestId)
    sessionStore?.process({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: '',
      payload: {},
    })
    remoteStreamAdapter.alwaysAllowPermission(serverId, sessionId, requestId)
  }
})

ipcMain.handle('remote:stream:suggestion', async (_event, sessionId: string, index: number) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  remoteStreamAdapter.suggestionPermission(serverId, sessionId, index)
})

ipcMain.handle('remote:stream:interrupt', async (_event, sessionId: string) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  remoteStreamAdapter.interrupt(serverId, sessionId)
})

ipcMain.handle('remote:stream:destroy', async (_event, sessionId: string) => {
  if (!remoteStreamAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  remoteSessionServerMap.delete(sessionId)
  await remoteStreamAdapter.destroy(serverId, sessionId)
})

ipcMain.handle('remote:hook:close-session', async (_event, sessionId: string) => {
  if (!remoteHookAdapter) return
  const serverId = remoteSessionServerMap.get(sessionId)
  if (!serverId) return
  remoteHookAdapter.closeSession(serverId, sessionId)
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
    const savedConfig = readConfig().notificationAutoClose as NotificationAutoCloseConfig | undefined
    const quickApproval = savedConfig?.quickApproval ?? true
    if (!notificationWin || notificationWin.isDestroyed()) {
      createNotificationWindow()
      // Wait for renderer to load before sending data
      notificationWin?.webContents.once('did-finish-load', () => {
        notificationWin?.webContents.send('bubble:show', notifications, quickApproval)
        sendBubbleSide()
      })
    } else {
      notificationWin.webContents.send('bubble:show', notifications, quickApproval)
    }
  } else {
    closeNotificationWindow()
  }

  // Send display state for status dot (always show regardless of panel visibility)
  const displayState = sessionStore?.resolveDisplayState()
  if (displayState && displayState.type !== 'idle' && displayState.type !== 'ended') {
    ballWin.webContents.send('bubble:status', displayState.type)
  } else {
    ballWin.webContents.send('bubble:status', null)
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

  historyStore = new HistoryStore(resolveDataDir())
  sessionStore.onSessionEnd((session) => {
    historyStore?.save(session)
  })

  // Load notification auto-close config from persisted config
  const defaultAutoClose: NotificationAutoCloseConfig = { approval: 0, error: 30, input: 15, done: 15, quickApproval: true }
  const savedAutoClose = readConfig().notificationAutoClose as NotificationAutoCloseConfig | undefined
  sessionStore.updateNotificationConfig(savedAutoClose ? { ...defaultAutoClose, ...savedAutoClose } : defaultAutoClose)

  streamManager = new StreamAdapterManager({
    sessionStore,
    broadcastToRenderer,
  })

  sessionStore.onInterventionChange(() => {
    bubbleControllerSync()
  })

  sessionStore.onNotificationChange(() => {
    bubbleControllerSync()
  })

  sessionStore.onPhaseChange(() => {
    bubbleControllerSync()
  })

  // Initialize remote manager
  remoteManager = new RemoteManager()

  // Set bundled remote server path for auto-update
  const bundledServerPath = app.isPackaged
    ? join(process.resourcesPath, 'coding-bubble-remote-server.js')
    : join(__dirname, '../../../../packages/remote/dist/coding-bubble-remote-server.js')
  remoteManager.setBundledServerPath(bundledServerPath)

  remoteHookAdapter = new RemoteHookAdapter(remoteManager, sessionStore)
  remoteStreamAdapter = new RemoteStreamAdapter(remoteManager, sessionStore)
  remoteHookAdapter.register()
  remoteStreamAdapter.register()

  // Push connection state changes to settings window
  remoteManager.onStateChange((serverId, state, extra) => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('remote:state-change', { serverId, state, ...extra })
    }
  })

  // Wire remote stream events to the shared handleStreamEvent
  const remoteStreamCtx: StreamEventContext = {
    pendingPermissions: new Map(),
    subToolParents: new Map(),
    interrupted: new Set(),
    destroying: new Set(),
  }
  remoteStreamAdapter.setEventHandler((sessionId, event) => {
    handleStreamEvent(sessionStore!, broadcastToRenderer, sessionId, event, remoteStreamCtx)
  })

  // Expose remoteStreamCtx for IPC handlers to clean up pending permissions
  ;(globalThis as Record<string, unknown>).__remoteStreamCtx = remoteStreamCtx

  // Connect to configured remote servers
  console.log(`[main] config path: ${getConfigPath()}`)
  const remoteServers = (readConfig().remoteServers as RemoteServerConfig[]) ?? []
  for (const serverConfig of remoteServers) {
    remoteManager.addServer(serverConfig)
  }

  createSocketServer({
    isManagedPid: (pid: number) => streamManager?.isManagedPid(pid) ?? false,
    onEvent: (event: HookEvent) => {
      console.log('[main] socket onEvent:', JSON.stringify(event))

      sessionStore?.process(event)

      // After processing, clean up stale pending permissions
      // (e.g. user answered AskUserQuestion in Claude Code terminal, PostToolUse transitions phase away from waitingForApproval)
      if (event.session_id) {
        const session = sessionStore?.get(event.session_id)
        const pending = pendingPermissionResolvers.get(event.session_id)
        if (pending && session && session.phase.type !== 'waitingForApproval') {
          console.log('[main] clearing stale pending permission for session:', event.session_id, 'due to:', event.hook_event_name, 'phase:', session.phase.type)
          pendingPermissionResolvers.delete(event.session_id)
          pending.resolve({ decision: 'deny', reason: 'stale' })
        }
      }

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
    onPermissionRequest: async (sessionId: string, toolUseId: string, toolName: string, toolInput: Record<string, unknown> | null, suggestions: PermissionSuggestion[] = []): Promise<HookResponse> => {
      // Check session permission mode - only prompt user if mode is 'default'
      const session = sessionStore?.sessions.get(sessionId)
      const permissionMode = session?.permissionMode ?? 'auto'

      console.log('[main] onPermissionRequest sessionId:', sessionId, 'permissionMode:', permissionMode, 'suggestions:', suggestions.length)

      if (permissionMode === 'bypassPermissions' || permissionMode === 'auto') {
        // Auto-allow for bypass and auto modes only
        console.log('[main] auto-allow for permissionMode:', permissionMode)
        return { decision: 'allow' }
      }

      // Wait for user approval
      return new Promise<HookResponse>((resolve) => {
        pendingPermissionResolvers.set(sessionId, { toolUseId, toolName, toolInput, formattedDetail: formatToolDetail(toolName, toolInput), suggestions, resolve })
        sessionStore?.process({
          hook_event_name: 'PermissionRequest',
          session_id: sessionId,
          cwd: '',
          payload: { toolUseId, tool: toolName, input: toolInput, suggestions }
        } as HookEvent)
      })
    },
    onPermissionCancel: (sessionId: string) => {
      const pending = pendingPermissionResolvers.get(sessionId)
      if (pending) {
        console.log('[main] cancelling pending permission for session:', sessionId, '(user answered in terminal)')
        pendingPermissionResolvers.delete(sessionId)
        const response: HookResponse = { decision: 'deny', reason: 'cancelled' }
        if (pending.toolUseId) {
          sessionStore?.resolvePermission(pending.toolUseId, response)
        }
        pending.resolve(response)
      }
    }
  })

  // Hide Dock icon at runtime (LSUIElement handles packaged app)
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.dock.hide()
  }

  createBallWindow()

  // Create system tray
  const trayIconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(__dirname, '../../resources/tray-icon.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon)
  tray.setToolTip('Coding-bubble')
  tray.setContextMenu(buildAppMenu())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBallWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  streamManager?.closeAll()
  remoteManager?.close()
  if (tray) {
    tray.destroy()
    tray = null
  }
})
