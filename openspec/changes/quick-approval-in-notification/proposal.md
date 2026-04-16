## Why

当主窗口关闭时，普通权限请求（如读写文件）只能通过悬浮球通知提示用户，用户必须点击通知打开主界面才能操作。对于高频的普通权限，这个流程过于繁琐。需要在通知气泡中直接提供"允许"按钮，让用户无需切换窗口即可快速授权。

## What Changes

- **通知气泡增加"允许"按钮**：`approval` 类型通知在非 `AskUserQuestion` 时，行内显示一个"允许"按钮。点击该按钮直接调用 `session.approve` 或 `stream.approve` IPC 完成授权，不打开主窗口。
- **保留点击行跳转行为**：点击通知行本身（非按钮区域）仍然导航到对应会话，与现有行为一致。
- **`AskUserQuestion` 排除**：当 `toolName === 'AskUserQuestion'` 时，通知行不显示"允许"按钮，保持现有纯通知行为。
- **BubbleNotification 数据扩展**：新增 `isAskUserQuestion` 布尔字段，由主进程在构建通知时根据 `toolName` 填充。
- **设置项**：在设置 > 通知页面新增"快速确认"开关，默认开启。关闭后通知气泡中不显示"允许"按钮。
- **Preload IPC 扩展**：FloatingBall 渲染进程需要调用 `session.approve` / `stream.approve`，当前 preload 未向悬浮球窗口暴露这些 API，需要补充。

## Capabilities

### New Capabilities

- `quick-approval`: 在悬浮球通知气泡中为普通权限提供内联"允许"按钮，支持一键授权而无需打开主窗口。包含设置项控制、AskUserQuestion 排除逻辑、以及 preload IPC 桥接。

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **FloatingBall/NotificationBubble.tsx + .css**：渲染逻辑增加"允许"按钮，样式调整
- **FloatingBall/index.tsx**：处理允许按钮点击事件，调用 approve IPC
- **packages/session-monitor/src/types.ts**：`BubbleNotification` 接口新增 `isAskUserQuestion` 字段
- **packages/session-monitor/src/session-store.ts**：`_updateNotifications` 构建通知时填充 `isAskUserQuestion`
- **apps/desktop/src/preload/index.ts**：悬浮球窗口增加 `session.approve` / `stream.approve` / `remote.*` API 暴露
- **apps/desktop/src/main/index.ts**：通知配置新增 `quickApproval` 字段，`bubbleControllerSync` 传递配置
- **SettingsPanel/index.tsx**：通知页面新增"快速确认"开关 UI
