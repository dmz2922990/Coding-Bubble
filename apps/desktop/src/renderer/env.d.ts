// Renderer global type declarations (injected via preload/index.ts contextBridge)
export {}

declare global {
  interface Window {
    electronAPI: {
      /** IPC ping */
      ping: () => Promise<string>
      /** Floating ball drag */
      dragStart: () => void
      dragMove: () => void
      dragEnd: () => void
      /** Transparent area click-through control */
      setIgnoreMouseEvents: (ignore: boolean) => void
      /** Lock click-through off for reliable double-click */
      holdClickable: () => void
      /** Open chat panel */
      openPanel: () => void
      /** Right-click context menu */
      showContextMenu: () => void
      /** Close current window */
      closeWindow: () => void
      /** Read config */
      getConfig: () => Promise<Record<string, unknown>>
      /** Write config */
      setConfig: (config: Record<string, unknown>) => Promise<void>
      /** Notification bubble: show/hide listeners (Main → Ball) */
      onBubbleShow: (cb: (event: unknown, interventions: unknown[], quickApproval?: boolean) => void) => () => void
      onBubbleHide: (cb: (event: unknown) => void) => () => void
      /** Status dot: display state listener (Main → Ball) */
      onBubbleStatus: (cb: (event: unknown, state: string | null) => void) => () => void
      /** Bubble side: left/right alignment listener (Main → Ball) */
      onBubbleSide: (cb: (event: unknown, side: 'left' | 'right') => void) => () => void
      /** Navigate to session tab (Ball → Main) */
      navigateToSession: (sessionId: string) => void
      /** Tab navigation listener (Main → Panel) */
      onNavigateToTab: (cb: (event: unknown, sessionId: string) => void) => () => void
      /** Settings tab navigation listener (Main → Settings) */
      onNavigateToSettingsTab: (cb: (event: unknown, tab: string) => void) => () => void
      /** App version */
      getAppVersion: () => Promise<string>
      /** Hook session management */
      session: {
        list: () => Promise<unknown[]>
        approve: (sessionId: string) => Promise<void>
        deny: (sessionId: string, reason?: string) => Promise<void>
        alwaysAllow: (sessionId: string) => Promise<void>
        answer: (sessionId: string, answer: string) => Promise<void>
        suggestion: (sessionId: string, index: number) => Promise<void>
        hooksStatus: () => Promise<{ installed: boolean }>
        installHooks: () => Promise<void>
        jumpToTerminal: (sessionId: string) => Promise<{ success: boolean; error?: string }>
        onUpdate: (cb: (event: unknown, data: unknown) => void) => () => void
      }
      /** Stream session management */
      stream: {
        create: (cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }) => Promise<{ sessionId?: string; error?: string }>
        send: (sessionId: string, text: string) => Promise<{ success?: boolean; error?: string }>
        destroy: (sessionId: string) => Promise<void>
        resume: (claudeSessionId: string, cwd: string) => Promise<{ sessionId?: string; error?: string }>
        approve: (sessionId: string) => Promise<void>
        deny: (sessionId: string, reason?: string) => Promise<void>
        alwaysAllow: (sessionId: string) => Promise<void>
        answer: (sessionId: string, answer: string) => Promise<void>
        suggestion: (sessionId: string, index: number) => Promise<void>
        interrupt: (sessionId: string) => Promise<void>
        onEvent: (cb: (event: unknown, data: unknown) => void) => () => void
      }
      /** Local directory browsing */
      local: {
        listDirectory: (path?: string) => Promise<{ name: string; path: string; type: string }[]>
      }
      /** Remote server management */
      remote: {
        connect: (serverId: string) => Promise<void>
        disconnect: (serverId: string) => Promise<void>
        listServers: () => Promise<unknown[]>
        addServer: (config: Record<string, unknown>) => Promise<void>
        removeServer: (serverId: string) => Promise<void>
        listDirectory: (serverId: string, path?: string) => Promise<unknown[]>
        stream: {
          create: (serverId: string, cwd: string, options?: { continue?: boolean; bypassPermissions?: boolean }) => Promise<{ sessionId?: string; error?: string }>
          send: (sessionId: string, text: string) => Promise<void>
          approve: (sessionId: string) => Promise<void>
          deny: (sessionId: string, reason?: string) => Promise<void>
          alwaysAllow: (sessionId: string) => Promise<void>
          suggestion: (sessionId: string, index: number) => Promise<void>
          interrupt: (sessionId: string) => Promise<void>
          destroy: (sessionId: string) => Promise<void>
        }
        hook: {
          closeSession: (sessionId: string) => Promise<void>
        }
        onStateChange: (cb: (event: unknown, data: { serverId: string; state: string; nextReconnectAt?: number }) => void) => () => void
      }
      /** Notification config */
      notification: {
        getConfig: () => Promise<Record<string, number | boolean>>
        setConfig: (config: Record<string, number | boolean>) => Promise<void>
      }
      /** Notification window: report content size to main process */
      notificationResize: (width: number, height: number) => void
      /** Dismiss a single notification by sessionId */
      dismissNotification: (sessionId: string) => void
      /** Quick approve a permission from notification bubble */
      quickApprove: (sessionId: string, source?: string) => Promise<void>
      /** Directory picker dialog */
      showOpenDialog: (options: Record<string, unknown>) => Promise<unknown>
      /** Save markdown file dialog */
      saveMarkdown: (content: string, defaultName: string) => Promise<{ success: boolean; path?: string }>
      /** Backend runtime config for API access */
      getBackendRuntimeConfig: () => Promise<{ httpBaseURL: string; wsBaseURL: string; authToken: string }>
    }
  }
}
