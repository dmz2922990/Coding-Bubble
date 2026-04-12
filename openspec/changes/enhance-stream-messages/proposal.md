## Why

当前流模式仅处理 `assistant`、`result`、`control_request(can_use_tool)` 三类 SDK 消息，用户在 Coding Bubble 中看到的体验远不如 CLI 原生终端：缺少流式文本输出、工具执行进度、会话状态变更、上下文压缩指示、速率限制告警等关键信息。需要扩展消息处理链路，使流模式体验接近 CLI 原生使用。

## What Changes

- **流式文本输出**: 处理 `stream_event` 消息（content_block_delta），实现逐字/逐段实时渲染助手回复，而非等待 `assistant` 完整消息后才显示
- **会话状态追踪**: 处理 `system.session_state_changed`（idle/running/requires_action），替代当前基于 hook 事件的 phase 推断逻辑
- **工具执行进度**: 处理 `tool_progress` 消息，显示工具执行耗时和进度描述
- **上下文压缩指示**: 处理 `system.status`（compacting）和 `system.compact_boundary`，在 UI 中显示压缩状态
- **速率限制告警**: 处理 `rate_limit_event`，在 UI 中显示限流状态和恢复时间
- **结果统计展示**: 处理 `result` 消息中的 usage/cost/duration 信息，在轮次结束时展示 token 消耗和耗时
- **API 重试提示**: 处理 `system.api_retry`，显示重试次数和延迟
- **工具摘要**: 处理 `tool_use_summary`，替代逐个工具调用展示为精简摘要行

## Capabilities

### New Capabilities

- `stream-text-rendering`: 流式文本实时渲染 — 捕获 `stream_event` 的 `content_block_delta` 事件，逐段更新 UI 中的助手消息，实现打字机效果
- `session-state-tracking`: 会话状态追踪 — 基于 `session_state_changed` 消息驱动 UI 状态（idle/running/requires_action），替代当前 phase 推断机制
- `tool-progress-display`: 工具进度与摘要 — 处理 `tool_progress` 显示执行耗时，处理 `tool_use_summary` 显示累计工具使用摘要
- `result-statistics`: 结果统计展示 — 解析 `result` 消息中的 usage/cost/duration，在轮次结束卡片中展示 token 消耗、API 耗时、总费用
- `system-status-indicators`: 系统状态指示 — 处理 compaction、rate limit、api retry 等系统消息，以非阻塞提示条形式展示

### Modified Capabilities

（无既有 spec 需要修改）

## Impact

- **`packages/stream-json/src/stream-session.ts`**: 扩展 `_handleLine` 和新增事件处理方法，新增 `stream_event`、`tool_progress`、`tool_use_summary`、`rate_limit_event` 等事件类型
- **`packages/stream-json/src/types.ts`**: 新增 StreamEvent 类型定义
- **`apps/desktop/src/main/stream-adapter.ts`**: 扩展 `_handleEvent` 处理新事件类型，桥接到 SessionStore
- **`apps/desktop/src/renderer/components/ChatPanel/types.ts`**: ChatItem 新增 `systemStatus`、`toolProgress`、`resultSummary` 等类型
- **`apps/desktop/src/renderer/components/ChatPanel/SessionTab.tsx`**: 新增渲染组件（流式光标、进度条、统计卡片、状态提示条）
- **`apps/desktop/src/renderer/components/ChatPanel/styles.css`**: 新增对应样式
