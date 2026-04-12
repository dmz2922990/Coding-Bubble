## Context

Stream 模式通过 `stream-json` 包与 Claude Code CLI 通信，当前 `stream-session.ts` 已解析 `assistant`（text/tool_use/thinking）、`result`、`stream_event`（text_delta）、`control_request`（permission）、`tool_progress`、`tool_use_summary`、`rate_limit_event`、以及 `system` 的部分子类型。

但执行过程中的关键信息未被桥接到 UI：
- `user` 消息中的 `tool_result` 被丢弃（stream-session.ts:207 注释 "logged only"）
- `thinking` 事件被 adapter 丢弃（仅发 Notification hook，不创建 ChatItem）
- `tool_use` 事件仅发 PreToolUse hook，不创建 toolCall ChatItem
- `task_started/progress/notification`、`post_turn_summary` 等完全未解析

三层架构：StreamSession（解析 stdout JSON）→ StreamAdapterManager（桥接到 SessionStore）→ Renderer（渲染 ChatItem）

## Goals / Non-Goals

**Goals:**
- Stream 模式下显示完整的工具调用卡片（名称、输入、结果、耗时）
- Stream 模式下显示思考内容（可折叠）
- Stream 模式下显示后台任务通知（启动、进度、完成）
- 复用 hook 模式已有的 ChatItem 类型（toolCall、thinking），不引入新渲染组件

**Non-Goals:**
- 不处理 `control_response`（输出方向）的解析
- 不处理 `auth_status`、`prompt_suggestion`
- 不处理 `stream_event` 中的 `input_json_delta`/`thinking_delta` 增量
- 不处理 hook 执行详情（hook_started/progress/response）
- 不处理 `files_persisted`
- 不新增 ChatHistoryItem 类型（复用现有类型）

## Decisions

### D1: tool_use → 创建 toolCall ChatItem

**决策**: 当收到 `assistant` 消息中的 `tool_use` block 时，立即创建 `toolCall` ChatItem（status=running）。当收到 `user` 消息中的 `tool_result` 时，更新该 ChatItem（status=success/error，附带结果文本）。

**理由**: 与 hook 模式的 toolCall ChatItem 完全一致，Renderer 无需修改。通过 `toolUseId`（即 block.id）匹配 tool_use 和 tool_result。

**替代方案**: 创建新的 `toolResult` 事件类型单独传递结果 → 需要在 adapter 层维护 toolUseId 到 ChatItem 的映射，增加复杂度。选择直接在 adapter 层用 toolUseId 查找并更新 ChatItem。

### D2: tool_result 从 `user` 消息提取

**决策**: 在 `stream-session.ts` 的 `_handleLine` 中，对 `user` 类型不再静默丢弃，而是检查是否有 `tool_use_result` 字段。若有，emit `tool_result` 事件。

**理由**: SDK 文档（§2.1）明确 `user` 消息包含 `tool_use_result` 字段，这是工具执行结果的唯一来源。

### D3: thinking → 直接创建 ChatItem

**决策**: `stream-adapter.ts` 的 `thinking` handler 直接创建 `thinking` ChatItem（而非仅发 Notification）。

**理由**: thinking 内容是用户可见的执行过程信息，应作为 ChatItem 渲染。

### D4: task 通知 → system ChatItem

**决策**: `task_started/progress/notification` 解析为内部事件，在 adapter 层转为 `system` ChatItem 展示。不新增 ChatHistoryItem 类型。

**理由**: task 通知是辅助信息，用 system 类型显示即可满足需求，避免引入新的 UI 组件。

### D5: post_turn_summary → system ChatItem

**决策**: 解析 `post_turn_summary` 的 `title` 和 `description`，转为 system ChatItem 展示。

**理由**: 与 task 通知相同策略，复用现有渲染。

## Risks / Trade-offs

- **tool_result 匹配失败**: 如果 SDK 发送的 tool_result 的 id 与 tool_use 的 id 不一致，ChatItem 会停留在 running 状态。缓解：在 `result` 事件时清理所有 running 状态的 toolCall。
- **thinking 内容过长**: 某些 thinking block 可能非常长。缓解：复用现有的 ThinkingItem 组件（已有截断逻辑）。
- **user 消息解析风险**: `user` 类型可能包含非 tool_result 的内容。缓解：仅在检测到 `tool_use_result` 时才处理，其余保持静默。
