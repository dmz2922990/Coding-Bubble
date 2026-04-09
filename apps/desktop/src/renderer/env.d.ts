// 渲染进程全局类型声明（由 preload/index.ts 通过 contextBridge 注入）
export {}

declare global {
  interface Window {
    electronAPI: {
      /** IPC 通路验证 */
      ping: () => Promise<string>
      /** 悬浮球拖拽 */
      dragStart: () => void
      dragMove: () => void
      dragEnd: () => void
      /** 透明区域点击穿透控制 */
      setIgnoreMouseEvents: (ignore: boolean) => void
      /** 右键上下文菜单 */
      showContextMenu: () => void
      /** 关闭当前窗口 */
      closeWindow: () => void
      /** 打开对话面板 */
      openPanel: () => void
      /** 读取配置 */
      getConfig: () => Promise<Record<string, unknown>>
      /** 写入配置 */
      setConfig: (config: Record<string, unknown>) => Promise<void>
      /** Notification bubble listeners */
      onBubbleShow: (cb: (event: unknown, data: unknown[]) => void) => () => void
      onBubbleHide: (cb: (event: unknown) => void) => () => void
      /** Status dot listener */
      onBubbleStatus: (cb: (event: unknown, state: string | null) => void) => () => void
      /** Navigate to session */
      navigateToSession: (sessionId: string) => void
      /** Tab navigation listener */
      onNavigateToTab: (cb: (event: unknown, sessionId: string) => void) => () => void
      /** 会话管理 */
      session: {
        list: () => Promise<unknown[]>
        approve: (sessionId: string) => Promise<void>
        deny: (sessionId: string, reason?: string) => Promise<void>
        hooksStatus: () => Promise<{ installed: boolean }>
        installHooks: () => Promise<void>
        jumpToTerminal: (sessionId: string) => Promise<{ success: boolean; error?: string }>
        onUpdate: (cb: (event: unknown, data: unknown) => void) => () => void
      }
    }
  }
}
