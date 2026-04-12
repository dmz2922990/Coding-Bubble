## Context

当前流模式架构分三层：

```
Claude Code CLI (子进程)
    ↓ stdout JSON Lines
StreamSession (packages/stream-json)
    ↓ EventEmitter (StreamEvent)
StreamAdapterManager (apps/desktop/src/main/stream-adapter.ts)
    ↓ SessionStore.process() → IPC broadcast
Renderer (SessionTab.tsx)
```

**当前状态**：
- `StreamSession._handleLine` 仅处理 `system`(init)、`assistant`、`result`、`control_request` 四种 SDK 消息类型
- `assistant` 消息被拆解为 `text`、`tool_use`、`thinking` 三种内部事件
- `stream_event`（流式增量）被完全忽略，UI 只在完整 `assistant` 消息到达后才更新
- `system` 消息只提取 `session_id`，忽略了所有 subtype（status、session_state_changed 等）
- Renderer 的 `ChatItem` 类型仅有 5 种：user / assistant / toolCall / thinking / interrupted

## Goals / Non-Goals

**Goals:**

1. 实时流式文本渲染 — 用户发送消息后能逐字/逐段看到助手回复
2. 精确的会话状态追踪 — 基于 `session_state_changed` 驱动 UI phase
3. 工具执行进度可视化 — 显示运行中的工具耗时和进度描述
4. 轮次结果统计 — 展示 token 消耗、API 耗时、费用
5. 系统状态提示 — compaction、rate limit、api retry 等非阻塞提示

**Non-Goals:**

- 不实现 MCP 消息代理（mcp_message、mcp_set_servers 等）
- 不实现 Hook 回调（hook_callback control_request subtype）
- 不实现文件回滚（rewind_files）
- 不实现精简文本模式（streamlined_text / streamlined_tool_use_summary）
- 不实现后台任务 UI（task_started / task_progress / task_notification）— 后续迭代
- 不修改 hook 模式的消息处理逻辑

## Decisions

### D1: 流式文本 — 累积快照模式

**选择**: 在 `StreamSession` 中累积 `stream_event` 的 `content_block_delta` 文本，以 100ms 间隔发出 `text_delta` 事件，UI 追加到当前 assistant 消息

**替代方案**:
- A) 直接透传每个 `stream_event` → 事件量大，React 渲染压力大
- B) 等待完整 `assistant` 消息 → 当前方案，无流式效果

**理由**: SDK 文档说明 CLI 已做 100ms 合并刷新，每个 delta 是全量快照而非增量。StreamSession 只需转发已合并的 delta，UI 用最新快照替换当前文本即可，无需自行合并。

**实现**: `StreamSession._handleLine` 新增 `case 'stream_event'`，解析 `event.event` 类型：
- `content_block_start` + type=text → 创建新的流式文本上下文
- `content_block_delta` + text_delta → 发出 `{ type: 'text_delta', content: snapshot }` 事件
- `content_block_stop` → 结束流式上下文
- `message_stop` → 标记流式结束

### D2: 会话状态 — session_state_changed 优先

**选择**: 优先使用 `session_state_changed` 消息的 `state` 字段（idle/running/requires_action）驱动 UI phase

**替代方案**:
- A) 继续用 hook 事件推断 phase → 不精确，stream 模式无 hook
- B) 混合使用两种来源 → 复杂，优先级难定

**理由**: `session_state_changed` 是 CLI 的权威状态信号（文档明确 "idle 是轮次结束的权威信号"）。在 stream 模式下应以此为准。

**映射**:
| SDK state | UI phase |
|-----------|----------|
| `idle` | idle |
| `running` | thinking / processing（根据是否有活跃 tool_use 判断） |
| `requires_action` | waitingForApproval / waitingForInput（根据 control_request 类型判断） |

### D3: ChatItem 扩展策略

**选择**: 在现有 `ChatItem.type` 联合类型中新增成员，而非创建独立的消息列表

**新增类型**:
```typescript
type ChatItem.type =
  | 'user' | 'assistant' | 'toolCall' | 'thinking' | 'interrupted'
  | 'systemStatus'      // compaction, rate limit, api retry
  | 'resultSummary'     // 轮次结果统计卡片
```

**理由**: 复用现有的消息列表渲染和滚动逻辑，`systemStatus` 和 `resultSummary` 作为内联消息插入聊天流中。

### D4: 工具进度 — 内联更新而非新消息

**选择**: `tool_progress` 消息更新现有 `toolCall` ChatItem 的 `elapsedSeconds` 字段，而非创建新的 ChatItem

**理由**: 工具进度是对已有工具调用的状态补充，不应打断聊天流。

### D5: StreamEvent 类型扩展

**选择**: 在 `StreamEventType` 中新增事件类型，保持现有的 EventEmitter 架构不变

```
新增 StreamEventType:
  'text_delta'     — 流式文本快照
  'session_state'  — 会话状态变更 (idle/running/requires_action)
  'tool_progress'  — 工具执行进度
  'tool_summary'   — 工具使用摘要
  'rate_limit'     — 速率限制事件
  'system_status'  — 系统状态 (compacting, api_retry 等)
```

**理由**: 最小化架构变更。每层只关注自己需要的事件类型，通过现有的 `StreamAdapter._handleEvent` switch 桥接到 SessionStore。

## Risks / Trade-offs

- **[流式文本性能]** 大量 `text_delta` 事件可能导致频繁 React 重渲染 → 使用 React state 批处理 + requestAnimationFrame 节流
- **[消息顺序]** `stream_event` 和 `assistant` 可能有重叠（CLI 先发 stream_event 再发完整 assistant）→ 在 StreamSession 中，收到完整 `assistant` 消息时清除流式文本上下文，用完整消息替换
- **[向后兼容]** 新增 StreamEventType 不影响现有 hook 模式 → hook 模式不经过 StreamSession，完全隔离
- **[system subtype 分辨]** `system` 消息需根据 `subtype` 字段路由到不同处理器 → 在 `_handleSystem` 中增加 subtype switch
