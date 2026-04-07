## Why

当前当主窗口未打开时，用户无法及时感知需要人工介入的会话（如权限审批、用户提问等），导致 workflow 中断，用户体验不佳。悬浮球作为常驻 UI 元素，应当承担起通知提醒的职责，让用户及时知晓并处理需要关注的事务。

## What Changes

- **悬浮球通知气泡 UI**: 在悬浮球上方添加可展开的通知气泡，显示需要人工介入的会话列表
- **Session 干预检测**: 当 session 进入 `waitingForApproval` 或 `waitingForInput` 状态时，判定为需要人工介入
- **多 Session 支持**: 气泡支持显示多个会话，每行显示会话名称和状态
- **点击跳转**: 点击气泡中的某行，打开主窗口并自动切换到对应 session 的 tab 页面
- **气泡自动关闭**: 当所有需要介入的 session 都被处理后，气泡自动消失

## Capabilities

### New Capabilities

- `notification-bubble`: 悬浮球通知气泡的显示/隐藏逻辑、UI 渲染、位置计算
- `session-intervention-detector`: 检测 session 是否需要人工介入，维护待处理列表
- `bubble-click-navigation`: 气泡点击打开主窗口并导航到指定 session tab

### Modified Capabilities

- (无 - 仅新增功能，不涉及现有 spec 变更)

## Impact

- **悬浮球窗口**: 添加气泡组件、状态监听、点击事件处理
- **主窗口**: 新增 IPC 接口支持外部导航到指定 tab
- **Session Store**: 需要暴露待处理干预事件列表
- **IPC 通信**: 新增 `bubble:show-notification`, `panel:navigate-to-session` 等通道
