## 1. StreamEvent 类型扩展

- [x] 1.1 在 `packages/stream-json/src/types.ts` 新增 StreamEventType: `text_delta`, `session_state`, `tool_progress`, `tool_summary`, `rate_limit`, `system_status`
- [x] 1.2 扩展 StreamEvent 接口，新增字段: `state`, `statusKind`, `elapsedSeconds`, `summary`, `attempt`, `maxRetries`, `delayMs`, `resetsAt`, `streaming`, `durationMs`, `durationApiMs`, `costUsd`

## 2. StreamSession 消息解析

- [x] 2.1 `_handleLine` 新增 `case 'stream_event'`，解析 content_block_delta/text_delta 事件，emit `text_delta` 内部事件
- [x] 2.2 `_handleLine` 新增 `case 'tool_progress'`，解析 tool_use_id / tool_name / elapsed_time_seconds，emit `tool_progress` 内部事件
- [x] 2.3 `_handleLine` 新增 `case 'tool_use_summary'`，解析 summary 字段，emit `tool_summary` 内部事件
- [x] 2.4 `_handleLine` 新增 `case 'rate_limit_event'`，解析 rate_limit_info.status / resetsAt，emit `rate_limit` 内部事件
- [x] 2.5 `_handleSystem` 扩展 subtype switch: `session_state_changed` → emit `session_state` 事件
- [x] 2.6 `_handleSystem` 扩展 subtype switch: `status`(compacting) → emit `system_status` 事件
- [x] 2.7 `_handleSystem` 扩展 subtype switch: `compact_boundary` → emit `system_status`(compacted) 事件
- [x] 2.8 `_handleSystem` 扩展 subtype switch: `api_retry` → emit `system_status` 事件
- [x] 2.9 `_handleResult` 扩展提取 duration_ms / duration_api_ms / total_cost_usd / usage 字段到 result 事件

## 3. ChatItem 类型扩展

- [x] 3.1 在 `types.ts` ChatItem.type 联合类型新增 `'systemStatus'` 和 `'resultSummary'`
- [x] 3.2 ChatItem 新增可选字段: `streaming?: boolean`, `elapsedSeconds?: number`, `toolUseId?: string`
- [x] 3.3 ChatItem 新增可选字段: `statusKind?: string`, `durationMs?: number`, `costUsd?: number`

## 4. StreamAdapter 事件桥接

- [x] 4.1 `_handleEvent` 新增 `case 'text_delta'`：创建或更新 streaming assistant ChatItem，标记 `streaming: true`
- [x] 4.2 `_handleEvent` 修改 `case 'text'`：收到完整 assistant 消息时，将 streaming ChatItem 标记为 `streaming: false` 并替换内容
- [x] 4.3 `_handleEvent` 新增 `case 'session_state'`：根据 state 值映射 UI phase，调用 SessionStore transition
- [x] 4.4 `_handleEvent` 新增 `case 'tool_progress'`：查找匹配 toolUseId 的 toolCall ChatItem，更新 elapsedSeconds
- [x] 4.5 `_handleEvent` 新增 `case 'tool_summary'`：创建 system ChatItem 包含摘要文本
- [x] 4.6 `_handleEvent` 新增 `case 'system_status'`：根据 statusKind 创建 systemStatus ChatItem
- [x] 4.7 `_handleEvent` 新增 `case 'rate_limit'`：创建 systemStatus ChatItem 包含限流状态
- [x] 4.8 修改 `case 'result'`：额外创建 resultSummary ChatItem 包含 usage/cost/duration

## 5. SessionStore 扩展

- [x] 5.1 新增 `addSystemStatus(sessionId, statusKind, message)` 方法，创建 systemStatus ChatItem
- [x] 5.2 新增 `addResultSummary(sessionId, usage)` 方法，创建 resultSummary ChatItem
- [x] 5.3 新增 `updateToolProgress(sessionId, toolUseId, elapsedSeconds)` 方法，更新 toolCall 的耗时

## 6. Renderer 渲染

- [x] 6.1 SessionTab MessageItem 新增 `case 'systemStatus'` 渲染分支：根据 statusKind 显示不同颜色状态条
- [x] 6.2 SessionTab MessageItem 新增 `case 'resultSummary'` 渲染分支：显示 "Xs · X tokens · $X.XX" 卡片
- [x] 6.3 修改 assistant 消息渲染：当 `streaming === true` 时，在文本末尾显示闪烁光标
- [x] 6.4 修改 toolCall 渲染：当 `elapsedSeconds > 0` 时，在工具名旁显示 "· Xs" 耗时
- [x] 6.5 styles.css 新增 systemStatus 样式：compacting(蓝)、api_retry(黄)、rate_limit(红)
- [x] 6.6 styles.css 新增 resultSummary 卡片样式
