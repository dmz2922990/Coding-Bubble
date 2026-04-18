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
  /** Lock click-through off for reliable double-click */
  holdClickable: (): void => {
    ipcRenderer.send('ball:hold-clickable')
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
  onBubbleShow: (cb: (event: unknown, interventions: unknown[], quickApproval?: boolean) => void) => {
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
  /** Bubble side: left/right alignment listener (Main → Ball) */
  onBubbleSide: (cb: (event: unknown, side: 'left' | 'right') => void) => {
    ipcRenderer.on('bubble:side', cb)
    return () => ipcRenderer.removeListener('bubble:side', cb)
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
    suggestion: (sessionId: string, index: number): Promise<void> => ipcRenderer.invoke('session:suggestion', sessionId, index),
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
    create: (cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }): Promise<{ sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('stream:create', cwd, options),
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
    suggestion: (sessionId: string, index: number): Promise<void> =>
      ipcRenderer.invoke('stream:suggestion', sessionId, index),
    interrupt: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('stream:interrupt', sessionId),
    onEvent: (cb: (event: unknown, data: unknown) => void) => {
      ipcRenderer.on('session:update', cb)
      return () => ipcRenderer.removeListener('session:update', cb)
    }
  },
  /** Local directory browsing */
  local: {
    listDirectory: (path?: string): Promise<unknown[]> =>
      ipcRenderer.invoke('local:list-directory', path),
  },
  /** Remote server management */
  remote: {
    connect: (serverId: string): Promise<void> =>
      ipcRenderer.invoke('remote:connect', serverId),
    disconnect: (serverId: string): Promise<void> =>
      ipcRenderer.invoke('remote:disconnect', serverId),
    listServers: (): Promise<unknown[]> =>
      ipcRenderer.invoke('remote:list-servers'),
    addServer: (config: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke('remote:add-server', config),
    removeServer: (serverId: string): Promise<void> =>
      ipcRenderer.invoke('remote:remove-server', serverId),
    listDirectory: (serverId: string, path?: string): Promise<unknown[]> =>
      ipcRenderer.invoke('remote:list-directory', serverId, path),
    stream: {
      create: (serverId: string, cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }): Promise<{ sessionId?: string; error?: string }> =>
        ipcRenderer.invoke('remote:stream:create', serverId, cwd, options),
      send: (sessionId: string, text: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:send', sessionId, text),
      approve: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:approve', sessionId),
      deny: (sessionId: string, reason?: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:deny', sessionId, reason),
      alwaysAllow: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:always-allow', sessionId),
      suggestion: (sessionId: string, index: number): Promise<void> =>
        ipcRenderer.invoke('remote:stream:suggestion', sessionId, index),
      interrupt: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:interrupt', sessionId),
      destroy: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('remote:stream:destroy', sessionId),
    },
    hook: {
      closeSession: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('remote:hook:close-session', sessionId),
    },
    onStateChange: (cb: (event: unknown, data: { serverId: string; state: string }) => void) => {
      ipcRenderer.on('remote:state-change', cb)
      return () => ipcRenderer.removeListener('remote:state-change', cb)
    },
  },
  /** Notification config */
  notification: {
    getConfig: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke('notification:get-config'),
    setConfig: (config: Record<string, number>): Promise<void> =>
      ipcRenderer.invoke('notification:set-config', config),
  },
  /** Notification window: report content size to main process */
  notificationResize: (width: number, height: number): void => {
    ipcRenderer.send('notification:resize', width, height)
  },
  /** Dismiss a single notification by sessionId */
  dismissNotification: (sessionId: string): void => {
    ipcRenderer.send('notification:dismiss', sessionId)
  },
  /** Quick approve a permission from notification bubble */
  quickApprove: (sessionId: string, source?: string): Promise<void> => {
    if (source === 'stream') {
      return ipcRenderer.invoke('stream:approve', sessionId)
    } else if (source === 'remote-stream') {
      return ipcRenderer.invoke('remote:stream:approve', sessionId)
    }
    // hook + remote-hook both go through session:approve
    return ipcRenderer.invoke('session:approve', sessionId)
  },
  /** Directory picker dialog */
  showOpenDialog: (options: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('dialog:showOpenDialog', options),
  /** Save markdown file dialog */
  saveMarkdown: (content: string, defaultName: string): Promise<{ success: boolean; path?: string }> =>
    ipcRenderer.invoke('dialog:saveMarkdown', content, defaultName),
})
