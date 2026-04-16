## 1. 数据模型扩展

- [x] 1.1 `packages/session-monitor/src/types.ts` — `BubbleNotification` 接口新增 `isAskUserQuestion: boolean` 和 `source?: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'` 字段
- [x] 1.2 `packages/session-monitor/src/session-store.ts` — `_updateNotifications()` 构建 BubbleNotification 时填充 `isAskUserQuestion`（根据 `toolName === 'AskUserQuestion'`）和 `source`（从 session 读取）
- [x] 1.3 `packages/session-monitor/src/types.ts` — `NotificationAutoCloseConfig` 接口新增 `quickApproval?: boolean` 字段

## 2. Preload IPC 桥接

- [x] 2.1 `apps/desktop/src/preload/index.ts` — 为悬浮球窗口新增 `quickApprove(sessionId, source)` API，内部根据 source 分发调用 `session.approve` / `stream.approve` / `remote.stream.approve` / `remote.hook.approve`
- [x] 2.2 `apps/desktop/src/renderer/env.d.ts` — 在 `Window.electronAPI` 类型声明中补充 `quickApprove` 方法

## 3. 主进程配置传递

- [x] 3.1 `apps/desktop/src/main/index.ts` — `notification:get-config` handler 返回值中包含 `quickApproval` 字段（默认 `true`）
- [x] 3.2 `apps/desktop/src/main/index.ts` — `bubbleControllerSync()` 将 `quickApproval` 配置值通过 `bubble:show` 事件一起发送给悬浮球窗口

## 4. 设置页面 UI

- [x] 4.1 `apps/desktop/src/renderer/components/SettingsPanel/index.tsx` — 通知 tab 新增"快速确认"toggle 开关，绑定 `quickApproval` 配置的读写

## 5. 通知气泡 UI

- [x] 5.1 `apps/desktop/src/renderer/components/FloatingBall/NotificationBubble.tsx` — 当 `quickApproval` 开启且通知类型为 `approval` 且 `!isAskUserQuestion` 时，行内渲染"允许"按钮
- [x] 5.2 `apps/desktop/src/renderer/components/FloatingBall/NotificationBubble.tsx` — "允许"按钮点击事件 stopPropagation 阻止冒泡到行点击，调用 `onQuickApprove(sessionId, source)` 回调
- [x] 5.3 `apps/desktop/src/renderer/components/FloatingBall/index.tsx` — 接收 `quickApproval` 配置，传递给 NotificationBubble；实现 `handleQuickApprove` 调用 `window.electronAPI.quickApprove(sessionId, source)` 并从通知列表移除该条目
- [x] 5.4 `apps/desktop/src/renderer/components/FloatingBall/NotificationBubble.css` — "允许"按钮样式：紧凑、accent 色背景、与行文本区域视觉分离
