## Why

Stream 模式下用户只能看到 assistant 文本输出和权限确认，无法看到工具调用（名称、输入、输出）和思考内容，导致执行过程不透明，与 Claude Code CLI 的体验差距较大。SDK 已通过 `tool_use_summary`、`tool_result`、`thinking` 等消息提供了完整的执行细节，但当前实现未将其桥接到 UI。

## What Changes

- 补全 `stream-session.ts` 对 `user` 消息中 `tool_result` 的解析，emit `tool_result` 事件
- `stream-adapter.ts` 的 `tool_use` handler 创建 `toolCall` ChatItem（状态 running）
- `stream-adapter.ts` 的 `tool_result` handler 更新 `toolCall` ChatItem（状态 success/error，附带结果文本）
- `stream-adapter.ts` 的 `thinking` handler 创建 `thinking` ChatItem
- 新增 `_handleSystem` 对 `post_turn_summary`、`task_started`、`task_progress`、`task_notification` 子类型的解析和桥接
- 扩展 `StreamEvent` 类型增加 `toolResult`、`taskLifecycle`、`postTurnSummary` 等事件
- 扩展 `ChatHistoryItem` 类型支持 task lifecycle 展示
- Renderer 层渲染 toolCall（含结果折叠）、thinking（可展开）、task 通知

## Capabilities

### New Capabilities
- `tool-call-display`: Stream 模式下解析并渲染工具调用的完整生命周期：调用开始（名称、输入）→ 执行中（进度）→ 完成（结果/错误），支持结果折叠展开
- `thinking-display`: Stream 模式下解析并渲染 Claude 的思考内容（thinking block），可展开查看详情
- `task-notification`: Stream 模式下解析并渲染后台任务生命周期（task_started → task_progress → task_notification），显示任务描述、进度和结果

### Modified Capabilities

## Impact

- `packages/stream-json/` — 新增事件类型和解析逻辑（tool_result、task 系列、post_turn_summary）
- `packages/session-monitor/` — ChatHistoryItem 类型扩展（task 相关字段）
- `apps/desktop/src/main/stream-adapter.ts` — 新增 tool_use → toolCall ChatItem 创建、tool_result 更新、thinking ChatItem 创建、task 桥接
- `apps/desktop/src/renderer/` — SessionTab 新增 toolCall（含结果）、thinking、task 通知的渲染分支及样式
