import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 向渲染进程安全暴露 IPC 通道
contextBridge.exposeInMainWorld('electronAPI', {
  /** IPC 通路验证 */
  ping: (): Promise<string> => ipcRenderer.invoke('ipc:ping'),
  /** 悬浮球拖拽 */
  dragStart: (): void => { ipcRenderer.send('drag:start') },
  dragMove: (): void => { ipcRenderer.send('drag:move') },
  dragEnd: (): void => { ipcRenderer.send('drag:end') },
  /** 透明区域点击穿透控制 */
  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore)
  },
  /** 打开对话面板 */
  openPanel: (): void => { ipcRenderer.send('panel:open') },
  /** 右键上下文菜单 */
  showContextMenu: (): void => { ipcRenderer.send('contextmenu:show') },
  /** 关闭当前窗口 */
  closeWindow: (): void => { ipcRenderer.send('window:close') },
  /** 读取配置 */
  getConfig: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('config:get'),
  /** 写入配置 */
  setConfig: (config: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('config:set', config),
  /** Notification bubble: show/hide listeners (Main → Ball) */
  onBubbleShow: (cb: (event: unknown, interventions: unknown[]) => void) => {
    ipcRenderer.on('bubble:show', cb)
    return () => ipcRenderer.removeListener('bubble:show', cb)
  },
  onBubbleHide: (cb: (event: unknown) => void) => {
    ipcRenderer.on('bubble:hide', cb)
    return () => ipcRenderer.removeListener('bubble:hide', cb)
  },
  /** Status dot: display state listener (Main → Ball) */
  onBubbleStatus: (cb: (event: unknown, state: string | null) => void) => {
    ipcRenderer.on('bubble:status', cb)
    return () => ipcRenderer.removeListener('bubble:status', cb)
  },
  /** Navigate to session tab (Ball → Main) */
  navigateToSession: (sessionId: string): void => {
    ipcRenderer.send('panel:navigate-to-session', sessionId)
  },
  /** Tab navigation listener (Main → Panel) */
  onNavigateToTab: (cb: (event: unknown, sessionId: string) => void) => {
    ipcRenderer.on('navigate-to-tab', cb)
    return () => ipcRenderer.removeListener('navigate-to-tab', cb)
  },
  /** 会话管理 */
  session: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('session:list'),
    approve: (sessionId: string): Promise<void> => ipcRenderer.invoke('session:approve', sessionId),
    deny: (sessionId: string, reason?: string): Promise<void> => ipcRenderer.invoke('session:deny', sessionId, reason),
    alwaysAllow: (sessionId: string): Promise<void> => ipcRenderer.invoke('session:always-allow', sessionId),
    answer: (sessionId: string, answer: string): Promise<void> => ipcRenderer.invoke('session:answer', sessionId, answer),
    hooksStatus: (): Promise<{ installed: boolean }> => ipcRenderer.invoke('session:hooks-status'),
    installHooks: (): Promise<void> => ipcRenderer.invoke('session:install-hooks'),
    jumpToTerminal: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('session:jump-to-terminal', sessionId),
    onUpdate: (cb: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('session:update', cb)
      return () => ipcRenderer.removeListener('session:update', cb)
    }
  },
  /** Stream session management */
  stream: {
    create: (cwd: string): Promise<{ sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('stream:create', cwd),
    send: (sessionId: string, text: string): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke('stream:send', sessionId, text),
    destroy: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('stream:destroy', sessionId),
    resume: (claudeSessionId: string, cwd: string): Promise<{ sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('stream:resume', claudeSessionId, cwd),
    approve: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('stream:approve', sessionId),
    deny: (sessionId: string, reason?: string): Promise<void> =>
      ipcRenderer.invoke('stream:deny', sessionId, reason),
    alwaysAllow: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('stream:always-allow', sessionId),
    answer: (sessionId: string, answer: string): Promise<void> =>
      ipcRenderer.invoke('stream:answer', sessionId, answer),
    onEvent: (cb: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('session:update', cb)
      return () => ipcRenderer.removeListener('session:update', cb)
    }
  },
  /** Directory picker dialog */
  showOpenDialog: (options: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('dialog:showOpenDialog', options),
})
