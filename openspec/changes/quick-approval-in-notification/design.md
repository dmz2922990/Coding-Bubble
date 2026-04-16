## Context

当前权限通知仅在悬浮球气泡中展示文本，用户必须点击通知打开主窗口，在 PermissionBar 中操作允许/拒绝。对于高频的普通权限（Read、Edit、Bash 等），这个流程增加了不必要的上下文切换。

通知气泡 (NotificationBubble) 和 FloatingBall 渲染在独立窗口中，通过 preload 暴露的 `electronAPI` 与主进程通信。当前 preload 仅向悬浮球窗口暴露了 `navigateToSession`、`dismissNotification`、`onBubbleShow/Hide/Status` 等接口，不包含权限操作 API。

设置面板已有"通知"标签页，配置四种通知类型的自动关闭时间，采用 config.json 持久化 + `notification:get-config/set-config` IPC 通道的模式。

## Goals / Non-Goals

**Goals:**
- 普通权限通知行内显示"允许"按钮，点击即授权，无需打开主窗口
- AskUserQuestion 通知排除，保持纯通知行为
- 默认开启，可在设置中关闭
- 与现有点击跳转行为完全兼容

**Non-Goals:**
- 不在通知中实现拒绝/始终允许/suggestion 等高级权限操作
- 不修改 AskUserQuestion 的通知行为
- 不改变主窗口中 PermissionBar 的现有 UI

## Decisions

### 1. AskUserQuestion 标识方式：BubbleNotification 新增字段

**选择**: 在 `BubbleNotification` 接口中新增 `isAskUserQuestion: boolean` 字段，由主进程在构建通知时填充。

**备选**: 渲染端通过 `toolName` 判断。
**理由**: 通知数据已包含 `toolName`，但渲染端不应依赖 toolName 字符串比较。显式字段更清晰、更易测试。

### 2. 设置项存储：复用现有 notification config

**选择**: 在现有 `notificationAutoClose` 配置对象中新增 `quickApproval: boolean` 字段，默认 `true`。通过现有 `notification:get-config/set-config` IPC 通道读写。

**理由**: 避免新增 IPC 通道，复用已有的设置持久化基础设施。

### 3. Approve IPC 调用路径

**选择**: 在 preload 的悬浮球窗口上下文中暴露 `quickApprove(sessionId, source)` API，内部根据 `source` 分发到 `session.approve` / `stream.approve` / `remote.stream.approve` / `remote.hook.approve`。

**备选**: 通知数据中携带 sessionId，渲染端自行判断调用哪个 IPC。
**理由**: 集中分发逻辑在 preload 中更安全，渲染端只需一个简单调用。需要在 `BubbleNotification` 中额外传递 `source` 字段。

### 4. 按钮布局：行内右侧

**选择**: "允许"按钮放在通知行右侧，dismiss (X) 按钮左侧。按钮用紧凑的 accent 样式。

**理由**: 最小化布局改动，保持通知行紧凑。按钮在视觉上与文本区域分离，避免误触导致跳转。

### 5. 通知数据扩展字段

**选择**: `BubbleNotification` 新增两个字段：
- `isAskUserQuestion: boolean` — 标识是否为 AskUserQuestion
- `source: 'hook' | 'stream' | 'remote-hook' | 'remote-stream'` — 会话来源，用于 approve 路由

**理由**: 渲染端需要 `source` 来决定调用哪个 approve IPC；`isAskUserQuestion` 用于控制按钮显示。

## Risks / Trade-offs

- **[误触风险]** 用户可能误点"允许"按钮授权了不期望的操作 → 按钮样式用 accent 色但非高亮，点击区域与行点击分离，事件 stopPropagation 阻止冒泡到行点击
- **[并发权限]** 快速连续多个权限请求时，每个通知独立显示允许按钮 → 符合预期，用户可以逐个或跳过处理
- **[窗口焦点]** 点击允许后不打开主窗口 → 符合设计目标，但用户可能不知道操作已执行 → 允许后通知行短暂显示"已允许"状态再消失（可选优化，首版可不做）
