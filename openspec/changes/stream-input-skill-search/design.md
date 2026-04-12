## Context

Coding Bubble 是一个 Electron + React + TypeScript 桌面应用，通过 `stream-json` 模式与 Claude Code CLI 交互。当前 stream 模式的输入框（`MessageInput.tsx`）是一个纯 textarea，无任何命令建议功能。

CLI 启动后输出 `system/init` 消息，包含 `skills`（string[]）和 `slash_commands`（string[]）字段。当前 `StreamSession._handleSystem()` 仅记录 session_id，丢弃所有其他字段。

**数据流路径**：CLI stdout → `StreamSession`（packages/stream-json）→ `StreamAdapterManager`（main 进程）→ IPC `_broadcast` → 渲染进程 `ChatPanel`。

## Goals / Non-Goals

**Goals:**
- 从 `system/init` 消息中捕获 skills 和 slash_commands，传递到渲染进程
- 在输入框中输入 `/` 时显示可过滤的命令建议列表
- 支持键盘导航和自动插入

**Non-Goals:**
- 不实现 skill 的描述预览或参数补全（可后续迭代）
- 不修改 CLI 侧的 `system/init` 消息格式
- 不处理 tools、mcp_servers 等其他 init 字段的 UI 展示
- 不支持非 stream 模式的 skill 建议

## Decisions

### D1: 新增 `session_init` 事件类型

在 `StreamEventType` 中新增 `'session_init'`，在 `StreamEvent` 中新增 `initMetadata` 字段。`StreamSession._handleSystem()` 的 `init` 分支提取 skills/slash_commands 并 emit。

**替代方案**：扩展现有 `session_state` 事件携带 init 数据——语义不清，`session_state` 表示状态变更，`init` 是一次性元数据。

**选择理由**：init 事件是一次性的生命周期事件，独立类型更清晰。

### D2: 通过 `session:update` IPC 传递 init 元数据

`StreamAdapterManager._handleEvent()` 收到 `session_init` 后，将 skills/slash_commands 存入 `SessionStore`，然后通过已有的 `_broadcast('session:update', ...)` 传递给渲染进程。渲染进程的 `onUpdate` 回调中提取 skills 数据。

**替代方案**：新增专用 IPC 通道 `session:init`——增加 preload 桥接代码。

**选择理由**：`session:update` 已有完整的 IPC 通道和渲染端订阅机制，复用更简洁。只需在 payload 中扩展字段。

### D3: 建议列表组件内联于 MessageInput

在 `MessageInput` 组件内部实现建议列表，不抽取为独立组件。使用 React state 控制显示/隐藏，CSS absolute positioning 将列表定位在输入框上方。

**替代方案**：使用 Popover/Portal 模式挂载到 document.body——过度工程化。

**选择理由**：建议列表仅在输入框中出现，生命周期与输入框一致，内联最简单。

### D4: 过滤策略为前缀匹配

输入 `/com` 时匹配以 `com` 开头的 skill（如 `commit`、`commit-push-pr`）。不做模糊匹配。

**理由**：skill 数量通常不超过 50 个，前缀匹配足够高效且符合用户直觉。

### D5: 建议列表的最大显示数量

最多显示 8 条建议，超出时列表可滚动。

**理由**：超过 8 条会遮挡过多聊天内容，且用户可通过继续输入缩小范围。

## Risks / Trade-offs

- **init 消息时序** → `system/init` 是 CLI 启动后的第一条消息，一定在用户可输入之前到达。无时序风险。
- **建议列表遮挡聊天内容** → 列表定位在输入框上方，最多占 8 条高度（约 240px），可接受。
- **skill 列表不可变** → `system/init` 只发送一次，会话期间 skill 列表不会变化。如未来支持动态 skill，需增加 reload 机制。
