import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { HookResponse } from '@coding-bubble/session-monitor'

let ballWin: BrowserWindow | null = null
let panelWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null

/** Pending permission resolvers keyed by sessionId */
const pendingPermissionResolvers = new Map<string, { toolUseId: string | undefined; resolve: (response: HookResponse) => void }>()

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

// ── IPC: 悬浮球拖拽 ────────────────────────────────────────
ipcMain.on('drag:start', () => {
  if (!ballWin) return
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = ballWin.getPosition()
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
})

ipcMain.on('drag:move', () => {
  if (!ballWin) return
  const { x, y } = screen.getCursorScreenPoint()
  ballWin.setPosition(
    Math.round(x - dragOffset.x),
    Math.round(y - dragOffset.y)
  )
})

ipcMain.on('drag:end', () => {
  if (!ballWin) return
  const [bx, by] = ballWin.getPosition()
  const existing = readConfig()
  writeConfig({ ...existing, ballPosition: { x: bx, y: by } })
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
  createPanelWindow()
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
  panelWin.on('ready-to-show', () => panelWin?.show())
  panelWin.on('closed', () => { panelWin = null })

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
      label: '退出 Claw',
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
import type { HookEvent, HookResponse } from '@coding-bubble/session-monitor'

let sessionStore: SessionStore | null = null
const jsonlWatchers = new Map<string, ReturnType<typeof watchJsonlFile>>()

function broadcastToRenderer(channel: string, data: unknown): void {
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

ipcMain.handle('session:hooks-status', () => {
  return { installed: hooksInstalled() }
})

ipcMain.handle('session:install-hooks', () => {
  installHooks()
  console.log('[main] hooks installed')
})

// ── App 生命周期 ───────────────────────────────────────────
app.whenReady().then(() => {
  try {
    installHooks()
  } catch (err) {
    console.error('[main] hook install failed:', err)
  }

  sessionStore = new SessionStore()
  sessionStore.onPublish((channel, data) => broadcastToRenderer(channel, data))

  createSocketServer({
    onEvent: (event: HookEvent) => {
      console.log('[main] socket onEvent:', JSON.stringify(event))
      sessionStore?.process(event)

      // Start JSONL watcher on session start
      if (event.hook_event_name === 'SessionStart' && event.session_id) {
        if (!jsonlWatchers.has(event.session_id) && event.cwd) {
          const watcher = watchJsonlFile(event.session_id, event.cwd, (sessionId, items) => {
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
    onPermissionRequest: async (sessionId, toolUseId, toolName, toolInput): Promise<HookResponse> => {
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
        pendingPermissionResolvers.set(sessionId, { toolUseId, resolve })
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
