## 1. StreamSession 事件解析

- [x] 1.1 扩展 `StreamEvent` 类型：新增 `tool_result`（toolUseId, content, isError）、`task_lifecycle`（taskPhase, taskId, content）、`post_turn_summary`（title, content）事件类型
- [x] 1.2 在 `_handleLine` 中解析 `user` 消息的 `tool_use_result` 字段，emit `tool_result` 事件（含 toolUseId, content, isError）
- [x] 1.3 在 `_handleSystem` 中新增 `task_started` 子类型解析，emit `task_lifecycle` 事件（taskPhase=started, taskId, content）
- [x] 1.4 在 `_handleSystem` 中新增 `task_progress` 子类型解析，emit `task_lifecycle` 事件（taskPhase=progress, taskId, content）
- [x] 1.5 在 `_handleSystem` 中新增 `task_notification` 子类型解析，emit `task_lifecycle` 事件（taskPhase=completed/failed, taskId, content）
- [x] 1.6 在 `_handleSystem` 中新增 `post_turn_summary` 子类型解析，emit `post_turn_summary` 事件（title, content）

## 2. StreamAdapterManager — toolUse/toolResult 桥接

- [x] 2.1 `tool_use` handler：创建 `toolCall` ChatItem（type=toolCall, id=toolUseId, tool.name, tool.input, tool.status=running），添加到 sessionStore
- [x] 2.2 `tool_result` handler：按 toolUseId 查找已有 toolCall ChatItem，更新 status 为 success/error，存储 tool.result
- [x] 2.3 `tool_result` handler：未匹配到任何 toolCall ChatItem 时静默忽略
- [x] 2.4 `result` handler：清理所有 status=running 的 toolCall ChatItem，标记为 success

## 3. StreamAdapterManager — thinking 桥接

- [x] 3.1 `thinking` handler：创建 `thinking` ChatItem（type=thinking, content=text），添加到 sessionStore

## 4. StreamAdapterManager — task/summary 桥接

- [x] 4.1 `taskLifecycle` handler（phase=started）：创建 system ChatItem，content="📌 任务启动: {description}"
- [x] 4.2 `taskLifecycle` handler（phase=completed）：创建 system ChatItem，content="✅ 任务完成: {summary}"
- [x] 4.3 `taskLifecycle` handler（phase=failed）：创建 system ChatItem，content="❌ 任务失败: {summary}"
- [x] 4.4 `taskLifecycle` handler（phase=progress）：创建 system ChatItem，content="⏳ 任务进度: {description}"
- [x] 4.5 `postTurnSummary` handler：创建 system ChatItem，content="📋 {title}: {description}"

## 5. SessionStore 类型扩展

- [x] 5.1 `ChatHistoryItem` 新增 `toolCall` 类型字段：`id`, `tool.name`, `tool.input`, `tool.status`（running/success/error）, `tool.result` — 已存在
- [x] 5.2 `ChatHistoryItem` 新增 `thinking` 类型字段：`content` — 已存在
- [x] 5.3 SessionStore 新增 `addToolCall`、`addThinking`、`updateStreamToolCall`、`cleanupRunningToolCalls` 方法

## 6. Renderer — toolCall 渲染

- [x] 6.1 `ToolItem` 组件已存在：显示工具名称、输入（JSON 折叠）、状态指示（dot 颜色）
- [x] 6.2 `ToolItem` 支持结果折叠：点击展开/收起 tool.result 文本
- [x] 6.3 SessionTab 的 ChatItem 渲染分支已有 `toolCall` 类型路由到 `ToolItem`

## 7. Renderer — thinking 渲染

- [x] 7.1 `ThinkingItem` 组件已存在：截断预览 80 字符，点击展开
- [x] 7.2 SessionTab 的 ChatItem 渲染分支已有 `thinking` 类型路由到 `ThinkingItem`

## 8. Renderer — task 通知渲染

- [x] 8.1 system ChatItem 支持 emoji 前缀的 task/summary 通知样式（📌/✅/❌/⏳/📋）— 复用现有 system 渲染
- [x] 8.2 ChatItem 类型新增 `'system'`，与现有 system 消息渲染一致

## 9. 集成测试与验证

- [ ] 9.1 验证 stream 模式下 tool_use → toolCall ChatItem 创建和状态更新完整流程
- [ ] 9.2 验证 thinking 内容正确渲染并可折叠展开
- [ ] 9.3 验证 task 通知（started/progress/completed/failed）正确显示
- [ ] 9.4 验证 post_turn_summary 正确显示
- [ ] 9.5 验证 result 事件时 running 状态的 toolCall 被正确清理
