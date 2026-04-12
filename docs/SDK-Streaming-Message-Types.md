# Claude Code SDK 流模式消息类型完整参考

> **Schema 来源**: `src/entrypoints/sdk/coreSchemas.ts` + `src/entrypoints/sdk/controlSchemas.ts`
>
> 所有消息通过 JSON Lines（NDJSON）在 stdin/stdout 上传输。
> 每个 JSON 对象占一行，以换行符 `\n` 分隔。

---

## 目录

- [一、总体架构](#一总体架构)
- [二、输入消息（StdinMessage — SDK → CLI）](#二输入消息stdinmessage--sdk--cli)
  - [2.1 SDKUserMessage](#21-sdkusermessage)
  - [2.2 SDKControlRequest](#22-sdkcontrolrequest)
  - [2.3 SDKControlResponse](#23-sdkcontrolresponse)
  - [2.4 SDKKeepAliveMessage](#24-sdkkeepalivemessage)
  - [2.5 SDKUpdateEnvironmentVariablesMessage](#25-sdkupdateenvironmentvariablesmessage)
- [三、输出消息（StdoutMessage — CLI → SDK）](#三输出消息stdoutmessage--cli--sdk)
  - [3.1 SDKAssistantMessage](#31-sdkassistantmessage)
  - [3.2 SDKPartialAssistantMessage](#32-sdkpartialassistantmessage)
  - [3.3 SDKResultMessage](#33-sdkresultmessage)
  - [3.4 SDKSystemMessage (init)](#34-sdksystemmessage-init)
  - [3.5 SDKStatusMessage](#35-sdkstatusmessage)
  - [3.6 SDKCompactBoundaryMessage](#36-sdkcompactboundarymessage)
  - [3.7 SDKAPIRetryMessage](#37-sdkapiretrymessage)
  - [3.8 SDKLocalCommandOutputMessage](#38-sdklocalcommandoutputmessage)
  - [3.9 SDKSessionStateChangedMessage](#39-sdksessionstatechangedmessage)
  - [3.10 SDKPostTurnSummaryMessage](#310-sdkpostturnsummarymessage)
  - [3.11 SDKToolProgressMessage](#311-sdktoolprogressmessage)
  - [3.12 SDKToolUseSummaryMessage](#312-sdktoolusesummarymessage)
  - [3.13 SDKAuthStatusMessage](#313-sdkauthstatusmessage)
  - [3.14 SDKRateLimitEvent](#314-sdkratelimitevent)
  - [3.15 SDKTaskStartedMessage](#315-sdktaskstartedmessage)
  - [3.16 SDKTaskProgressMessage](#316-sdktaskprogressmessage)
  - [3.17 SDKTaskNotificationMessage](#317-sdktasknotificationmessage)
  - [3.18 SDKFilesPersistedEvent](#318-sdkfilespersistedevent)
  - [3.19 SDKHookStartedMessage](#319-sdkhookstartedmessage)
  - [3.20 SDKHookProgressMessage](#320-sdkhookprogressmessage)
  - [3.21 SDKHookResponseMessage](#321-sdkhookresponsemessage)
  - [3.22 SDKElicitationCompleteMessage](#322-sdkelicitationcompletemessage)
  - [3.23 SDKPromptSuggestionMessage](#323-sdkpromptsuggestionmessage)
  - [3.24 SDKStreamlinedTextMessage](#324-sdkstreamlinedtextmessage)
  - [3.25 SDKStreamlinedToolUseSummaryMessage](#325-sdkstreamlinedtoolusesummarymessage)
  - [3.26 SDKControlRequest（输出方向）](#326-sdkcontrolrequest输出方向)
  - [3.27 SDKControlResponse（输出方向）](#327-sdkcontrolresponse输出方向)
  - [3.28 SDKControlCancelRequest](#328-sdkcontrolcancelrequest)
  - [3.29 SDKKeepAliveMessage（输出方向）](#329-sdkkeepalivemessage输出方向)
- [四、通用字段说明](#四通用字段说明)
- [五、传输层协议](#五传输层协议)
- [六、消息流转图](#六消息流转图)

---

## 一、总体架构

```
┌────────────────────────────┐        stdin (JSON Lines)         ┌────────────────────┐
│                                               │  ──── StdinMessage  ────▶   │                                 │
│   SDK 消费者                                   │                                   │   Claude Code CLI               │
│   (Python / TypeScript)                       │  ◀──── StdoutMessage ────   │                                 │
│                                               │        stdout (JSON Lines)        │                                 │
└────────────────────────────┘                                   └────────┬───────────┘
                                                                                                    │
                                                                                                    │ SSE / WebSocket
                                                                                                    ▼
                                                                                              Anthropic API
```

### StdinMessage 联合类型（SDK → CLI）

| type | 说明 |
|------|------|
| `user` | 用户消息 |
| `control_request` | 控制请求（21 种 subtype） |
| `control_response` | 控制响应 |
| `keep_alive` | 心跳保活 |
| `update_environment_variables` | 运行时更新环境变量 |

### StdoutMessage 联合类型（CLI → SDK）

包含 `SDKMessageSchema` 的所有成员（24 种）加上额外的控制协议和流式优化类型，共计约 **30 种**消息。

---

## 二、输入消息（StdinMessage — SDK → CLI）

### 2.1 SDKUserMessage

用户发送给 CLI 的消息，包含对话内容或工具调用结果。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"user"` | 是 | 消息类型标识 |
| `message` | `APIUserMessage` | 是 | Anthropic API 格式的用户消息（外部类型） |
| `parent_tool_use_id` | `string \| null` | 是 | 所属父工具调用 ID，顶层消息为 `null` |
| `isSynthetic` | `boolean` | 否 | 是否为合成消息（系统自动生成） |
| `tool_use_result` | `unknown` | 否 | 工具调用结果 |
| `priority` | `"now" \| "next" \| "later"` | 否 | 消息优先级。`now` 立即处理；`next` 下一轮处理；`later` 异步排队 |
| `timestamp` | `string` | 否 | ISO 8601 时间戳，消息创建时间 |
| `uuid` | `string` | 否 | 消息唯一标识（UUID） |
| `session_id` | `string` | 否 | 会话 ID |

#### priority 字段范围

| 值 | 说明 |
|----|------|
| `"now"` | 立即处理，中断当前操作 |
| `"next"` | 排入下一轮处理队列 |
| `"later"` | 异步排队，不阻塞 |

---

### 2.2 SDKControlRequest

CLI 与 SDK 之间的控制协议请求。通过 `request.subtype` 区分具体操作。

#### 外层包装

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"control_request"` | 是 | 消息类型标识 |
| `request_id` | `string` | 是 | 请求唯一标识，用于匹配响应 |
| `request` | `SDKControlRequestInner` | 是 | 具体请求内容（见下表） |

#### 2.2.1 initialize — 初始化会话

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"initialize"` | 是 | |
| `hooks` | `Record<HookEvent, SDKHookCallbackMatcher[]>` | 否 | Hook 配置 |
| `sdkMcpServers` | `string[]` | 否 | SDK 管理的 MCP 服务器名称列表 |
| `jsonSchema` | `Record<string, unknown>` | 否 | JSON Schema 定义（用于结构化输出） |
| `systemPrompt` | `string` | 否 | 自定义系统提示词（替换默认） |
| `appendSystemPrompt` | `string` | 否 | 追加到默认系统提示词之后 |
| `agents` | `Record<string, AgentDefinition>` | 否 | 自定义 Agent 定义 |
| `promptSuggestions` | `boolean` | 否 | 是否启用提示建议 |
| `agentProgressSummaries` | `boolean` | 否 | 是否启用 Agent 进度摘要 |

#### 2.2.2 interrupt — 中断当前轮次

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"interrupt"` | 是 | 中断正在运行的对话轮 |

#### 2.2.3 can_use_tool — 工具权限请求响应

SDK 消费者响应 CLI 发出的工具权限请求。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"can_use_tool"` | 是 | |
| `tool_name` | `string` | 是 | 工具名称 |
| `input` | `Record<string, unknown>` | 是 | 工具输入参数 |
| `permission_suggestions` | `PermissionUpdate[]` | 否 | 权限更新建议 |
| `blocked_path` | `string` | 否 | 被阻止的文件路径 |
| `decision_reason` | `string` | 否 | 决策原因 |
| `title` | `string` | 否 | 显示标题 |
| `display_name` | `string` | 否 | 工具显示名称 |
| `tool_use_id` | `string` | 是 | 工具调用 ID |
| `agent_id` | `string` | 否 | 代理 ID |
| `description` | `string` | 否 | 操作描述 |

#### 2.2.4 set_permission_mode — 设置权限模式

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"set_permission_mode"` | 是 | |
| `mode` | `PermissionMode` | 是 | 权限模式（见下表） |
| `ultraplan` | `boolean` | 否 | `@internal` CCR ultraplan 会话标记 |

**PermissionMode 范围：**

| 值 | 说明 |
|----|------|
| `"default"` | 标准模式，危险操作会提示确认 |
| `"acceptEdits"` | 自动接受文件编辑操作 |
| `"bypassPermissions"` | 跳过所有权限检查（需要 `allowDangerouslySkipPermissions`） |
| `"plan"` | 规划模式，不执行实际工具操作 |
| `"dontAsk"` | 不提示权限确认，未预批准则拒绝 |

#### 2.2.5 set_model — 切换模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"set_model"` | 是 | |
| `model` | `string` | 否 | 模型标识符（如 `"claude-sonnet-4-6"`），省略则恢复默认 |

#### 2.2.6 set_max_thinking_tokens — 设置思考 token 上限

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"set_max_thinking_tokens"` | 是 | |
| `max_thinking_tokens` | `number \| null` | 是 | token 数量上限，`null` 禁用扩展思考 |

#### 2.2.7 mcp_status — 查询 MCP 服务器状态

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"mcp_status"` | 是 | |

#### 2.2.8 get_context_usage — 获取上下文使用量

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"get_context_usage"` | 是 | |

#### 2.2.9 mcp_message — 发送 MCP JSON-RPC 消息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"mcp_message"` | 是 | |
| `server_name` | `string` | 是 | 目标 MCP 服务器名称 |
| `message` | `JSONRPCMessage` | 是 | JSON-RPC 消息（外部类型） |

#### 2.2.10 mcp_set_servers — 动态替换 MCP 服务器集

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"mcp_set_servers"` | 是 | |
| `servers` | `Record<string, McpServerConfig>` | 是 | 新的 MCP 服务器配置映射 |

**McpServerConfig 类型：**

| type 值 | 字段 | 说明 |
|---------|------|------|
| `"stdio"` (可选) | `command`, `args?`, `env?` | 本地进程通信 |
| `"sse"` | `url`, `headers?` | Server-Sent Events 连接 |
| `"http"` | `url`, `headers?` | HTTP 连接 |
| `"sdk"` | `name` | SDK 内置服务器 |

#### 2.2.11 mcp_reconnect — 重连 MCP 服务器

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"mcp_reconnect"` | 是 | |
| `serverName` | `string` | 是 | 需要重连的服务器名称 |

#### 2.2.12 mcp_toggle — 启用/禁用 MCP 服务器

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"mcp_toggle"` | 是 | |
| `serverName` | `string` | 是 | 服务器名称 |
| `enabled` | `boolean` | 是 | `true` 启用，`false` 禁用 |

#### 2.2.13 hook_callback — Hook 回调

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"hook_callback"` | 是 | |
| `callback_id` | `string` | 是 | 回调 ID |
| `input` | `HookInput` | 是 | Hook 输入数据（取决于 hook 事件类型） |
| `tool_use_id` | `string` | 否 | 关联的工具调用 ID |

#### 2.2.14 rewind_files — 回滚文件

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"rewind_files"` | 是 | |
| `user_message_id` | `string` | 是 | 回滚到此用户消息时的文件状态 |
| `dry_run` | `boolean` | 否 | `true` 仅检查不执行 |

#### 2.2.15 cancel_async_message — 取消异步消息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"cancel_async_message"` | 是 | |
| `message_uuid` | `string` | 是 | 要取消的消息 UUID |

#### 2.2.16 seed_read_state — 种子化读取状态缓存

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"seed_read_state"` | 是 | |
| `path` | `string` | 是 | 文件路径 |
| `mtime` | `number` | 是 | 文件修改时间戳 |

#### 2.2.17 reload_plugins — 重载插件

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"reload_plugins"` | 是 | |

#### 2.2.18 stop_task — 停止任务

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"stop_task"` | 是 | |
| `task_id` | `string` | 是 | 要停止的任务 ID |

#### 2.2.19 apply_flag_settings — 应用标志设置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"apply_flag_settings"` | 是 | |
| `settings` | `Record<string, unknown>` | 是 | 要合并的设置项 |

#### 2.2.20 get_settings — 获取当前设置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"get_settings"` | 是 | |

#### 2.2.21 elicitation — MCP 交互响应

SDK 消费者对 CLI 发出的 MCP 交互请求的回复。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"elicitation"` | 是 | |
| `mcp_server_name` | `string` | 是 | MCP 服务器名称 |
| `message` | `string` | 是 | 交互消息 |
| `mode` | `"form" \| "url"` | 否 | 交互模式 |
| `url` | `string` | 否 | URL（url 模式时） |
| `elicitation_id` | `string` | 否 | 交互 ID |
| `requested_schema` | `Record<string, unknown>` | 否 | 请求的 JSON Schema |

---

### 2.3 SDKControlResponse

SDK 消费者对 CLI 发出的控制请求的响应。

#### 外层包装

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"control_response"` | 是 | |
| `response` | `ControlSuccessResponse \| ControlErrorResponse` | 是 | |

#### 成功响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"success"` | 是 | |
| `request_id` | `string` | 是 | 对应请求的 ID |
| `response` | `Record<string, unknown>` | 否 | 响应数据 |

#### 错误响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtype` | `"error"` | 是 | |
| `request_id` | `string` | 是 | 对应请求的 ID |
| `error` | `string` | 是 | 错误描述 |
| `pending_permission_requests` | `SDKControlRequest[]` | 否 | 仍在等待的权限请求列表 |

---

### 2.4 SDKKeepAliveMessage

心跳保活消息，维持连接活性。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"keep_alive"` | 是 | 没有其他字段 |

---

### 2.5 SDKUpdateEnvironmentVariablesMessage

运行时动态更新 CLI 进程的环境变量。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"update_environment_variables"` | 是 | |
| `variables` | `Record<string, string>` | 是 | 环境变量键值对映射 |

---

## 三、输出消息（StdoutMessage — CLI → SDK）

### 3.1 SDKAssistantMessage

Claude 助手的完整回复消息。在流式模式下，此消息在所有 `stream_event` 之后发出，表示该轮回复的完整内容。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"assistant"` | 是 | |
| `message` | `APIAssistantMessage` | 是 | Anthropic API 格式的完整助手消息（外部类型，包含文本、工具调用、思考等内容块） |
| `parent_tool_use_id` | `string \| null` | 是 | 所属父工具调用 ID，顶层为 `null` |
| `error` | `SDKAssistantMessageError` | 否 | 错误类型（见下表） |
| `uuid` | `string` | 是 | 消息唯一标识（UUID） |
| `session_id` | `string` | 是 | 会话 ID |

**SDKAssistantMessageError 范围：**

| 值 | 说明 |
|----|------|
| `"authentication_failed"` | 认证失败 |
| `"billing_error"` | 计费错误 |
| `"rate_limit"` | 速率限制 |
| `"invalid_request"` | 无效请求 |
| `"server_error"` | 服务器错误 |
| `"unknown"` | 未知错误 |
| `"max_output_tokens"` | 达到最大输出 token 限制 |

---

### 3.2 SDKPartialAssistantMessage

流式增量事件。来自 Anthropic API 的 `RawMessageStreamEvent`，逐块传递助手的生成内容。用于实时渲染流式输出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"stream_event"` | 是 | |
| `event` | `RawMessageStreamEvent` | 是 | Anthropic API 原始流事件（外部类型）。常见事件类型见下表 |
| `parent_tool_use_id` | `string \| null` | 是 | 所属父工具调用 ID |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**常见 RawMessageStreamEvent 类型：**

| event.type | 说明 |
|------------|------|
| `message_start` | 消息开始，包含初始 message 对象 |
| `content_block_start` | 内容块开始（文本/工具调用/思考） |
| `content_block_delta` | 内容增量（文本片段/工具输入片段/思考片段） |
| `content_block_stop` | 内容块结束 |
| `message_delta` | 消息级增量（stop_reason、usage） |
| `message_stop` | 消息结束 |

**流式文本合并（Text Delta Coalescing）：**

CLI 会对 `text_delta` 事件进行合并优化：
- 每 **100ms** 刷新一次（`STREAM_EVENT_FLUSH_INTERVAL_MS`）
- 将同一内容块的多个 `text_delta` 合并为一个"全量快照"
- 客户端无需累积碎片，每次收到的都是自内容块开始以来的完整文本

---

### 3.3 SDKResultMessage

一轮对话的最终结果。分为成功和错误两种子类型。

#### 成功结果（subtype: success）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"result"` | 是 | |
| `subtype` | `"success"` | 是 | |
| `duration_ms` | `number` | 是 | 总耗时（毫秒） |
| `duration_api_ms` | `number` | 是 | API 调用耗时（毫秒） |
| `is_error` | `boolean` | 是 | 是否包含错误（始终为 `false`） |
| `num_turns` | `number` | 是 | 对话轮次总数 |
| `result` | `string` | 是 | 最终结果文本 |
| `stop_reason` | `string \| null` | 是 | 停止原因 |
| `total_cost_usd` | `number` | 是 | 总费用（美元） |
| `usage` | `NonNullableUsage` | 是 | Token 使用量（外部类型） |
| `modelUsage` | `Record<string, ModelUsage>` | 是 | 按模型统计的使用量 |
| `permission_denials` | `SDKPermissionDenial[]` | 是 | 权限拒绝记录 |
| `structured_output` | `unknown` | 否 | 结构化输出（启用时） |
| `fast_mode_state` | `FastModeState` | 否 | 快速模式状态 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

#### 错误结果

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"result"` | 是 | |
| `subtype` | 见下表 | 是 | 错误子类型 |
| `duration_ms` | `number` | 是 | 总耗时（毫秒） |
| `duration_api_ms` | `number` | 是 | API 调用耗时（毫秒） |
| `is_error` | `boolean` | 是 | 始终为 `true` |
| `num_turns` | `number` | 是 | 对话轮次总数 |
| `stop_reason` | `string \| null` | 是 | 停止原因 |
| `total_cost_usd` | `number` | 是 | 总费用（美元） |
| `usage` | `NonNullableUsage` | 是 | Token 使用量 |
| `modelUsage` | `Record<string, ModelUsage>` | 是 | 按模型统计的使用量 |
| `permission_denials` | `SDKPermissionDenial[]` | 是 | 权限拒绝记录 |
| `errors` | `string[]` | 是 | 错误信息列表 |
| `fast_mode_state` | `FastModeState` | 否 | 快速模式状态 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**错误 subtype 范围：**

| 值 | 说明 |
|----|------|
| `"error_during_execution"` | 执行过程中出错 |
| `"error_max_turns"` | 超过最大轮次限制 |
| `"error_max_budget_usd"` | 超过预算上限 |
| `"error_max_structured_output_retries"` | 结构化输出重试次数超限 |

**ModelUsage 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `inputTokens` | `number` | 输入 token 数 |
| `outputTokens` | `number` | 输出 token 数 |
| `cacheReadInputTokens` | `number` | 缓存读取的输入 token 数 |
| `cacheCreationInputTokens` | `number` | 缓存创建的输入 token 数 |
| `webSearchRequests` | `number` | Web 搜索请求数 |
| `costUSD` | `number` | 费用（美元） |
| `contextWindow` | `number` | 上下文窗口大小 |
| `maxOutputTokens` | `number` | 最大输出 token 数 |

**SDKPermissionDenial 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `tool_name` | `string` | 被拒绝的工具名称 |
| `tool_use_id` | `string` | 工具调用 ID |
| `tool_input` | `Record<string, unknown>` | 工具输入参数 |

**FastModeState 范围：**

| 值 | 说明 |
|----|------|
| `"off"` | 快速模式关闭 |
| `"cooldown"` | 速率限制后冷却中 |
| `"on"` | 快速模式启用 |

---

### 3.4 SDKSystemMessage (init)

会话初始化消息。CLI 启动后首先发送此消息，描述当前会话的完整配置。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"init"` | 是 | |
| `agents` | `string[]` | 否 | 可用 Agent 类型列表 |
| `apiKeySource` | `ApiKeySource` | 是 | API Key 来源 |
| `betas` | `string[]` | 否 | 启用的 Beta 功能标识 |
| `claude_code_version` | `string` | 是 | Claude Code 版本号 |
| `cwd` | `string` | 是 | 当前工作目录 |
| `tools` | `string[]` | 是 | 可用工具列表 |
| `mcp_servers` | `{ name: string, status: string }[]` | 是 | MCP 服务器列表及状态 |
| `model` | `string` | 是 | 当前使用的模型 |
| `permissionMode` | `PermissionMode` | 是 | 当前权限模式 |
| `slash_commands` | `string[]` | 是 | 可用 slash 命令列表 |
| `output_style` | `string` | 是 | 输出风格 |
| `skills` | `string[]` | 是 | 可用技能列表 |
| `plugins` | `{ name: string, path: string, source?: string }[]` | 是 | 已加载插件列表 |
| `fast_mode_state` | `FastModeState` | 否 | 快速模式状态 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**ApiKeySource 范围：**

| 值 | 说明 |
|----|------|
| `"user"` | 用户级 API Key |
| `"project"` | 项目级 API Key |
| `"org"` | 组织级 API Key |
| `"temporary"` | 临时 API Key |
| `"oauth"` | OAuth 认证 |

---

### 3.5 SDKStatusMessage

状态变更通知。CLI 状态发生变化时发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"status"` | 是 | |
| `status` | `SDKStatus` | 是 | 当前状态 |
| `permissionMode` | `PermissionMode` | 否 | 当前权限模式 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**SDKStatus 范围：**

| 值 | 说明 |
|----|------|
| `"compacting"` | 正在压缩上下文 |
| `null` | 空闲状态 |

---

### 3.6 SDKCompactBoundaryMessage

上下文压缩边界标记。上下文压缩（手动或自动）完成时发出，标记新旧上下文的分界。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"compact_boundary"` | 是 | |
| `compact_metadata.trigger` | `"manual" \| "auto"` | 是 | 触发方式：手动或自动 |
| `compact_metadata.pre_tokens` | `number` | 是 | 压缩前的 token 数 |
| `compact_metadata.preserved_segment` | `object` | 否 | 保留段的链接信息（用于恢复） |
| `compact_metadata.preserved_segment.head_uuid` | `string` | 否 | 保留段头部 UUID |
| `compact_metadata.preserved_segment.anchor_uuid` | `string` | 否 | 锚点 UUID |
| `compact_metadata.preserved_segment.tail_uuid` | `string` | 否 | 保留段尾部 UUID |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.7 SDKAPIRetryMessage

API 请求失败重试通知。当请求失败且为可重试错误时发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"api_retry"` | 是 | |
| `attempt` | `number` | 是 | 当前重试次数（从 1 开始） |
| `max_retries` | `number` | 是 | 最大重试次数 |
| `retry_delay_ms` | `number` | 是 | 重试延迟（毫秒） |
| `error_status` | `number \| null` | 是 | HTTP 状态码，连接超时时为 `null` |
| `error` | `SDKAssistantMessageError` | 是 | 错误类型 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.8 SDKLocalCommandOutputMessage

本地 slash 命令的输出（如 `/voice`、`/cost`）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"local_command_output"` | 是 | |
| `content` | `string` | 是 | 命令输出内容 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.9 SDKSessionStateChangedMessage

会话状态机变更通知。反映 CLI 的顶层运行状态。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"session_state_changed"` | 是 | |
| `state` | `SessionState` | 是 | 新状态（见下表） |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**SessionState 范围：**

| 值 | 说明 |
|----|------|
| `"idle"` | 空闲 — 轮次结束、后台任务完成的权威信号 |
| `"running"` | 运行中 — 正在处理请求 |
| `"requires_action"` | 需要操作 — 等待 SDK 消费者响应（如权限请求） |

---

### 3.10 SDKPostTurnSummaryMessage

后台助手每轮完成后的摘要。`@internal` 内部使用。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"post_turn_summary"` | 是 | |
| `summarizes_uuid` | `string` | 是 | 指向被摘要的 assistant 消息 UUID |
| `status_category` | `string` | 是 | 状态类别（见下表） |
| `status_detail` | `string` | 是 | 状态详情文本 |
| `is_noteworthy` | `boolean` | 是 | 是否值得关注 |
| `title` | `string` | 是 | 摘要标题 |
| `description` | `string` | 是 | 摘要描述 |
| `recent_action` | `string` | 是 | 最近执行的操作 |
| `needs_action` | `string` | 是 | 需要的操作 |
| `artifact_urls` | `string[]` | 是 | 产物 URL 列表 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**status_category 范围：**

| 值 | 说明 |
|----|------|
| `"blocked"` | 被阻塞 |
| `"waiting"` | 等待中 |
| `"completed"` | 已完成 |
| `"review_ready"` | 待审查 |
| `"failed"` | 失败 |

---

### 3.11 SDKToolProgressMessage

工具执行进度。工具运行过程中定期发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"tool_progress"` | 是 | |
| `tool_use_id` | `string` | 是 | 工具调用 ID |
| `tool_name` | `string` | 是 | 工具名称 |
| `parent_tool_use_id` | `string \| null` | 是 | 父工具调用 ID |
| `elapsed_time_seconds` | `number` | 是 | 已执行时间（秒） |
| `task_id` | `string` | 否 | 关联任务 ID |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.12 SDKToolUseSummaryMessage

工具使用累计摘要。将多轮工具调用总结为可读字符串。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"tool_use_summary"` | 是 | |
| `summary` | `string` | 是 | 摘要文本（如 "Read 2 files, wrote 1 file"） |
| `preceding_tool_use_ids` | `string[]` | 是 | 被摘要的工具调用 ID 列表 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.13 SDKAuthStatusMessage

认证状态消息。认证流程进行中或完成时发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"auth_status"` | 是 | |
| `isAuthenticating` | `boolean` | 是 | 是否正在认证中 |
| `output` | `string[]` | 是 | 认证输出信息 |
| `error` | `string` | 否 | 错误信息 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.14 SDKRateLimitEvent

速率限制状态变更事件。当速率限制信息发生变化时发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"rate_limit_event"` | 是 | |
| `rate_limit_info` | `SDKRateLimitInfo` | 是 | 速率限制详情（见下表） |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**SDKRateLimitInfo 结构：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | `RateLimitStatus` | 是 | 当前限流状态 |
| `resetsAt` | `number` | 否 | 限制重置时间（Unix 时间戳，秒） |
| `rateLimitType` | `RateLimitType` | 否 | 限流类型 |
| `utilization` | `number` | 否 | 利用率（0-1） |
| `overageStatus` | `OverageStatus` | 否 | 超额状态 |
| `overageResetsAt` | `number` | 否 | 超额重置时间 |
| `overageDisabledReason` | `OverageDisabledReason` | 否 | 超额禁用原因 |
| `isUsingOverage` | `boolean` | 否 | 是否正在使用超额额度 |
| `surpassedThreshold` | `number` | 否 | 超过的阈值百分比 |

**RateLimitStatus 范围：**

| 值 | 说明 |
|----|------|
| `"allowed"` | 允许请求 |
| `"allowed_warning"` | 允许但接近限制 |
| `"rejected"` | 已被限流拒绝 |

**RateLimitType 范围：**

| 值 | 说明 |
|----|------|
| `"five_hour"` | 5 小时窗口 |
| `"seven_day"` | 7 天窗口 |
| `"seven_day_opus"` | 7 天 Opus 模型窗口 |
| `"seven_day_sonnet"` | 7 天 Sonnet 模型窗口 |
| `"overage"` | 超额使用 |

**OverageDisabledReason 范围：**

| 值 | 说明 |
|----|------|
| `"overage_not_provisioned"` | 未配置超额额度 |
| `"org_level_disabled"` | 组织级禁用 |
| `"org_level_disabled_until"` | 组织级临时禁用 |
| `"out_of_credits"` | 信用额度耗尽 |
| `"seat_tier_level_disabled"` | 席位级别禁用 |
| `"member_level_disabled"` | 成员级别禁用 |
| `"seat_tier_zero_credit_limit"` | 席位零信用限制 |
| `"group_zero_credit_limit"` | 组零信用限制 |
| `"member_zero_credit_limit"` | 成员零信用限制 |
| `"org_service_level_disabled"` | 组织服务级禁用 |
| `"org_service_zero_credit_limit"` | 组织服务零信用限制 |
| `"no_limits_configured"` | 无限制配置 |
| `"unknown"` | 未知原因 |

---

### 3.15 SDKTaskStartedMessage

后台任务启动通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"task_started"` | 是 | |
| `task_id` | `string` | 是 | 任务 ID |
| `tool_use_id` | `string` | 否 | 关联工具调用 ID |
| `description` | `string` | 是 | 任务描述 |
| `task_type` | `string` | 否 | 任务类型 |
| `workflow_name` | `string` | 否 | 工作流名称（仅 `local_workflow` 类型） |
| `prompt` | `string` | 否 | 任务提示词 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.16 SDKTaskProgressMessage

后台任务进度通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"task_progress"` | 是 | |
| `task_id` | `string` | 是 | 任务 ID |
| `tool_use_id` | `string` | 否 | 关联工具调用 ID |
| `description` | `string` | 是 | 进度描述 |
| `usage.total_tokens` | `number` | 是 | 已消耗总 token 数 |
| `usage.tool_uses` | `number` | 是 | 已执行工具调用次数 |
| `usage.duration_ms` | `number` | 是 | 已执行时长（毫秒） |
| `last_tool_name` | `string` | 否 | 最后调用的工具名 |
| `summary` | `string` | 否 | 进度摘要 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.17 SDKTaskNotificationMessage

后台任务完成/失败/停止通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"task_notification"` | 是 | |
| `task_id` | `string` | 是 | 任务 ID |
| `tool_use_id` | `string` | 否 | 关联工具调用 ID |
| `status` | `TaskStatus` | 是 | 任务状态（见下表） |
| `output_file` | `string` | 是 | 任务输出文件路径 |
| `summary` | `string` | 是 | 任务结果摘要 |
| `usage` | `TaskUsage` | 否 | 任务使用量统计 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**TaskStatus 范围：**

| 值 | 说明 |
|----|------|
| `"completed"` | 任务完成 |
| `"failed"` | 任务失败 |
| `"stopped"` | 任务被停止 |

**TaskUsage 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_tokens` | `number` | 总 token 数 |
| `tool_uses` | `number` | 工具调用次数 |
| `duration_ms` | `number` | 执行时长（毫秒） |

---

### 3.18 SDKFilesPersistedEvent

文件持久化完成通知。文件写入磁盘后发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"files_persisted"` | 是 | |
| `files` | `{ filename: string, file_id: string }[]` | 是 | 成功持久化的文件列表 |
| `failed` | `{ filename: string, error: string }[]` | 是 | 持久化失败的文件列表 |
| `processed_at` | `string` | 是 | 处理完成时间（ISO 8601） |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.19 SDKHookStartedMessage

Hook 开始执行通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"hook_started"` | 是 | |
| `hook_id` | `string` | 是 | Hook 实例 ID |
| `hook_name` | `string` | 是 | Hook 名称 |
| `hook_event` | `string` | 是 | 触发的 Hook 事件类型 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.20 SDKHookProgressMessage

Hook 执行进度通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"hook_progress"` | 是 | |
| `hook_id` | `string` | 是 | Hook 实例 ID |
| `hook_name` | `string` | 是 | Hook 名称 |
| `hook_event` | `string` | 是 | Hook 事件类型 |
| `stdout` | `string` | 是 | 标准输出 |
| `stderr` | `string` | 是 | 标准错误输出 |
| `output` | `string` | 是 | 合并输出 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.21 SDKHookResponseMessage

Hook 执行完成通知。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"hook_response"` | 是 | |
| `hook_id` | `string` | 是 | Hook 实例 ID |
| `hook_name` | `string` | 是 | Hook 名称 |
| `hook_event` | `string` | 是 | Hook 事件类型 |
| `output` | `string` | 是 | Hook 输出 |
| `stdout` | `string` | 是 | 标准输出 |
| `stderr` | `string` | 是 | 标准错误输出 |
| `exit_code` | `number` | 否 | 退出码 |
| `outcome` | `HookOutcome` | 是 | 执行结果 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

**HookOutcome 范围：**

| 值 | 说明 |
|----|------|
| `"success"` | 执行成功 |
| `"error"` | 执行出错 |
| `"cancelled"` | 已取消 |

---

### 3.22 SDKElicitationCompleteMessage

MCP 交互完成通知。MCP 服务器确认 URL 模式交互已完成时发出。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | |
| `subtype` | `"elicitation_complete"` | 是 | |
| `mcp_server_name` | `string` | 是 | MCP 服务器名称 |
| `elicitation_id` | `string` | 是 | 交互 ID |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.23 SDKPromptSuggestionMessage

提示建议。每轮完成后，CLI 预测用户可能想说的下一句话。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"prompt_suggestion"` | 是 | |
| `suggestion` | `string` | 是 | 建议的提示文本 |
| `uuid` | `string` | 是 | 消息唯一标识 |
| `session_id` | `string` | 是 | 会话 ID |

---

### 3.24 SDKStreamlinedTextMessage

精简文本输出。`@internal` 内部使用。替代 `SDKAssistantMessage`，只保留文本内容，去除思考和工具调用块。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"streamlined_text"` | 是 | |
| `text` | `string` | 是 | 保留的文本内容 |
| `session_id` | `string` | 是 | 会话 ID |
| `uuid` | `string` | 是 | 消息唯一标识 |

---

### 3.25 SDKStreamlinedToolUseSummaryMessage

精简工具摘要。`@internal` 内部使用。将工具调用块替换为累计摘要字符串。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"streamlined_tool_use_summary"` | 是 | |
| `tool_summary` | `string` | 是 | 工具调用摘要（如 "Read 2 files, wrote 1 file"） |
| `session_id` | `string` | 是 | 会话 ID |
| `uuid` | `string` | 是 | 消息唯一标识 |

---

### 3.26 SDKControlRequest（输出方向）

CLI 向 SDK 消费者发出的控制请求（双向通信）。格式与 [2.2 SDKControlRequest](#22-sdkcontrolrequest) 相同。

输出方向主要用于：
- **`can_use_tool`**：CLI 请求 SDK 消费者批准工具调用权限
- **`elicitation`**：CLI 转发 MCP 服务器的交互请求
- **`initialize`** 的响应方向：CLI 返回初始化结果

---

### 3.27 SDKControlResponse（输出方向）

CLI 对 SDK 消费者控制请求的响应。格式与 [2.3 SDKControlResponse](#23-sdkcontrolresponse) 相同。

**特定响应类型：**

| 原始请求 subtype | 响应内容 |
|------------------|----------|
| `initialize` | `SDKControlInitializeResponse` |
| `mcp_status` | `SDKControlMcpStatusResponse` |
| `get_context_usage` | `SDKControlGetContextUsageResponse` |
| `rewind_files` | `SDKControlRewindFilesResponse` |
| `cancel_async_message` | `SDKControlCancelAsyncMessageResponse` |
| `mcp_set_servers` | `SDKControlMcpSetServersResponse` |
| `reload_plugins` | `SDKControlReloadPluginsResponse` |
| `get_settings` | `SDKControlGetSettingsResponse` |

#### initialize 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `commands` | `SlashCommand[]` | 是 | 可用 slash 命令列表 |
| `agents` | `AgentInfo[]` | 是 | 可用 Agent 列表 |
| `output_style` | `string` | 是 | 输出风格 |
| `available_output_styles` | `string[]` | 是 | 可用输出风格列表 |
| `models` | `ModelInfo[]` | 是 | 可用模型列表 |
| `account` | `AccountInfo` | 是 | 账户信息 |
| `pid` | `number` | 否 | CLI 进程 PID |
| `fast_mode_state` | `FastModeState` | 否 | 快速模式状态 |

**SlashCommand 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 技能名称（不含前导 `/`） |
| `description` | `string` | 描述 |
| `argumentHint` | `string` | 参数提示（如 `"<file>"`） |

**AgentInfo 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Agent 类型标识（如 `"Explore"`） |
| `description` | `string` | 描述 |
| `model` | `string` | 否 | 使用的模型别名 |

**ModelInfo 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | `string` | 模型标识符 |
| `displayName` | `string` | 显示名称 |
| `description` | `string` | 描述 |
| `supportsEffort` | `boolean` | 否 | 是否支持 effort 级别 |
| `supportedEffortLevels` | `("low" \| "medium" \| "high" \| "max")[]` | 否 | 可用 effort 级别 |
| `supportsAdaptiveThinking` | `boolean` | 否 | 是否支持自适应思考 |
| `supportsFastMode` | `boolean` | 否 | 是否支持快速模式 |
| `supportsAutoMode` | `boolean` | 否 | 是否支持自动模式 |

**AccountInfo 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `email` | `string` | 否 | 用户邮箱 |
| `organization` | `string` | 否 | 组织 |
| `subscriptionType` | `string` | 否 | 订阅类型 |
| `tokenSource` | `string` | 否 | Token 来源 |
| `apiKeySource` | `string` | 否 | API Key 来源 |
| `apiProvider` | `"firstParty" \| "bedrock" \| "vertex" \| "foundry"` | 否 | API 后端 |

#### mcp_status 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mcpServers` | `McpServerStatus[]` | 是 | MCP 服务器状态列表 |

**McpServerStatus 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 服务器名称 |
| `status` | `"connected" \| "failed" \| "needs-auth" \| "pending" \| "disabled"` | 连接状态 |
| `serverInfo` | `{ name: string, version: string }` | 否 | 服务器信息 |
| `error` | `string` | 否 | 错误信息 |
| `config` | `McpServerStatusConfig` | 否 | 服务器配置 |
| `scope` | `string` | 否 | 配置作用域 |
| `tools` | `{ name: string, description?: string, annotations?: {...} }[]` | 否 | 提供的工具 |
| `capabilities` | `{ experimental?: Record<string, unknown> }` | 否 | 服务器能力 |

#### get_context_usage 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `categories` | `ContextCategory[]` | 是 | 上下文分类用量 |
| `totalTokens` | `number` | 是 | 总 token 数 |
| `maxTokens` | `number` | 是 | 最大 token 数 |
| `rawMaxTokens` | `number` | 是 | 原始最大 token 数 |
| `percentage` | `number` | 是 | 使用百分比 |
| `gridRows` | `ContextGridSquare[][]` | 是 | 可视化网格 |
| `model` | `string` | 是 | 当前模型 |
| `memoryFiles` | `{ path: string, type: string, tokens: number }[]` | 是 | 内存文件 |
| `mcpTools` | `{ name: string, serverName: string, tokens: number, isLoaded?: boolean }[]` | 是 | MCP 工具 |
| `deferredBuiltinTools` | `{ name: string, tokens: number, isLoaded: boolean }[]` | 否 | 延迟加载的内置工具 |
| `systemTools` | `{ name: string, tokens: number }[]` | 否 | 系统工具 |
| `systemPromptSections` | `{ name: string, tokens: number }[]` | 否 | 系统提示词段落 |
| `agents` | `{ agentType: string, source: string, tokens: number }[]` | 是 | Agent 用量 |
| `slashCommands` | `{ totalCommands: number, includedCommands: number, tokens: number }` | 否 | Slash 命令用量 |
| `skills` | `{ totalSkills: number, includedSkills: number, tokens: number, skillFrontmatter: {...}[] }` | 否 | 技能用量 |
| `autoCompactThreshold` | `number` | 否 | 自动压缩阈值 |
| `isAutoCompactEnabled` | `boolean` | 是 | 是否启用自动压缩 |
| `messageBreakdown` | `MessageBreakdown` | 否 | 消息级别统计 |
| `apiUsage` | `{ input_tokens: number, output_tokens: number, cache_creation_input_tokens: number, cache_read_input_tokens: number } \| null` | 是 | API 用量 |

#### rewind_files 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `canRewind` | `boolean` | 是 | 是否可以回滚 |
| `error` | `string` | 否 | 错误信息 |
| `filesChanged` | `string[]` | 否 | 将被修改的文件列表 |
| `insertions` | `number` | 否 | 新增行数 |
| `deletions` | `number` | 否 | 删除行数 |

#### cancel_async_message 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cancelled` | `boolean` | 是 | 是否成功取消 |

#### mcp_set_servers 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `added` | `string[]` | 是 | 新增的服务器名称 |
| `removed` | `string[]` | 是 | 移除的服务器名称 |
| `errors` | `Record<string, string>` | 是 | 失败的服务器及错误信息 |

#### reload_plugins 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `commands` | `SlashCommand[]` | 是 | 刷新后的命令列表 |
| `agents` | `AgentInfo[]` | 是 | 刷新后的 Agent 列表 |
| `plugins` | `{ name: string, path: string, source?: string }[]` | 是 | 插件列表 |
| `mcpServers` | `McpServerStatus[]` | 是 | MCP 服务器状态 |
| `error_count` | `number` | 是 | 加载错误数 |

#### get_settings 响应

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `effective` | `Record<string, unknown>` | 是 | 合并后的有效设置 |
| `sources` | `SettingsSource[]` | 是 | 各来源原始设置（低→高优先级排列） |
| `applied` | `{ model: string, effort: "low" \| "medium" \| "high" \| "max" \| null }` | 否 | 运行时解析后的实际值 |

**SettingsSource 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `"userSettings" \| "projectSettings" \| "localSettings" \| "flagSettings" \| "policySettings"` | 设置来源 |
| `settings` | `Record<string, unknown>` | 该来源的设置内容 |

---

### 3.28 SDKControlCancelRequest

取消一个正在等待响应的控制请求。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"control_cancel_request"` | 是 | |
| `request_id` | `string` | 是 | 要取消的请求 ID |

---

### 3.29 SDKKeepAliveMessage（输出方向）

CLI 发出的心跳保活消息。维持连接活性，防止超时断开。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"keep_alive"` | 是 | 没有其他字段 |

---

## 四、通用字段说明

### 公共字段

以下字段出现在几乎所有输出消息中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uuid` | `string` | 消息唯一标识符（UUID v4）。用于追踪、去重和关联消息 |
| `session_id` | `string` | 会话 ID。标识当前会话，会话恢复时保持不变 |
| `parent_tool_use_id` | `string \| null` | 父工具调用 ID。标识消息所属的子代理调用层级，顶层消息为 `null` |

### 消息分类（type 字段）

| type 值 | 方向 | 消息大类 |
|---------|------|----------|
| `"assistant"` | 输出 | 助手完整回复 |
| `"user"` | 双向 | 用户消息 |
| `"result"` | 输出 | 轮次结果 |
| `"system"` | 输出 | 系统消息（通过 subtype 区分） |
| `"stream_event"` | 输出 | 流式增量事件 |
| `"tool_progress"` | 输出 | 工具进度 |
| `"tool_use_summary"` | 输出 | 工具摘要 |
| `"auth_status"` | 输出 | 认证状态 |
| `"rate_limit_event"` | 输出 | 限流事件 |
| `"prompt_suggestion"` | 输出 | 提示建议 |
| `"streamlined_text"` | 输出 | 精简文本 |
| `"streamlined_tool_use_summary"` | 输出 | 精简工具摘要 |
| `"control_request"` | 双向 | 控制请求 |
| `"control_response"` | 双向 | 控制响应 |
| `"control_cancel_request"` | 输出 | 取消控制请求 |
| `"keep_alive"` | 双向 | 心跳 |
| `"update_environment_variables"` | 输入 | 环境变量更新 |

### system 消息子类型（subtype 字段）

| subtype 值 | 说明 |
|------------|------|
| `"init"` | 会话初始化 |
| `"status"` | 状态变更 |
| `"compact_boundary"` | 上下文压缩边界 |
| `"api_retry"` | API 重试 |
| `"local_command_output"` | 本地命令输出 |
| `"session_state_changed"` | 会话状态变更 |
| `"post_turn_summary"` | 轮次后摘要 |
| `"files_persisted"` | 文件持久化 |
| `"task_started"` | 任务启动 |
| `"task_progress"` | 任务进度 |
| `"task_notification"` | 任务完成 |
| `"hook_started"` | Hook 启动 |
| `"hook_progress"` | Hook 进度 |
| `"hook_response"` | Hook 完成 |
| `"elicitation_complete"` | MCP 交互完成 |

---

## 五、传输层协议

### 5.1 进程模式（stdin/stdout JSON Lines）

SDK 通过子进程方式启动 Claude Code CLI：
- **写入**: 向 CLI 的 `stdin` 写入 JSON Lines（`\n` 分隔）
- **读取**: 从 CLI 的 `stdout` 读取 JSON Lines（`\n` 分隔）
- 每个 JSON 对象必须在一行内，不能跨行

### 5.2 远程模式（SSE + HTTP POST）

CCR v2 架构使用 Server-Sent Events 进行流式传输：

**读取流（SSE）：**
- 端点：`/worker/events/stream`
- 事件格式：`event: client_event\ndata: {...}\n\n`
- 支持序列号追踪：`from_sequence_num`、`Last-Event-ID` 用于断线恢复
- 存活检测：45 秒无数据视为连接死亡
- 自动重连：指数退避（基础 1s，最大 30s），10 分钟内放弃

**写入流（HTTP POST）：**
- 端点：`/worker/events`
- 使用 `SerialBatchEventUploader` 批量上传
- 重试：最多 10 次，基础延迟 500ms，最大 8s

**StreamClientEvent（SSE 帧）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_id` | `string` | 事件唯一 ID |
| `sequence_num` | `number` | 单调递增序列号 |
| `event_type` | `string` | 事件类型 |
| `source` | `string` | 事件来源 |
| `payload` | `Record<string, unknown>` | 事件载荷（即 StdoutMessage 的 JSON） |
| `created_at` | `string` | 创建时间 |

### 5.3 流式事件处理

```
          API SSE Stream
               │
               ▼ RawMessageStreamEvent
┌─────────────────┐
│   CLI 累加器                │  text_delta 合并为全量快照
│  (100ms 刷新)               │  非文本事件直接透传
└────────┬────────┘
               │
               ▼ SDKPartialAssistantMessage
┌─────────────────┐
│  传输层                      │  SSE / WebSocket / stdout
└────────┬────────┘
               │
               ▼
            SDK 消费者
```

**关键参数：**

| 参数 | 值 | 说明 |
|------|-----|------|
| `STREAM_EVENT_FLUSH_INTERVAL_MS` | 100ms | 流事件刷新间隔 |
| `DEFAULT_HEARTBEAT_INTERVAL_MS` | 20s | 心跳间隔（服务器 TTL 60s） |
| `LIVENESS_TIMEOUT_MS` | 45s | 存活检测超时 |
| `RECONNECT_BASE_DELAY_MS` | 1000ms | 重连基础延迟 |
| `RECONNECT_MAX_DELAY_MS` | 30000ms | 重连最大延迟 |
| `RECONNECT_GIVE_UP_MS` | 600000ms | 放弃重连超时（10 分钟） |

---

## 六、消息流转图

```
         SDK 消费者                             Claude Code CLI                     Anthropic API
            │                                        │                                     │
            │── user message  ────────────▶│                                     │
            │                                        │── API Request────────────▶│
            │                                        │                                     │
            │                                        │◀── stream_event (message_start) ─│
            │◀── stream_event (message_start) ───│                                     │
            │                                        │◀── stream_event (content_block*)─│
            │◀─ stream_event (content_block_delta)─│  (100ms 合并刷新)                    │
            │     ...                                │                                     │
            │                                        │◀── stream_event (message_stop) ──│
            │◀── stream_event (message_stop) ───│                                      │
            │                                        │                                     │
            │◀── assistant (完整消息) ─────────│                                     │
            │                                        │                                     │
            │◀── control_request (can_use_tool) ──│  (需要权限时)                        │
            │── control_response (allow) ──────▶│                                     │
            │                                        │── API Request ────────────▶│
            │                                        │◀── stream events ───────────│
            │◀── stream_event ... ──────────│                                       │
            │◀── assistant ... ────────────│                                       │
            │                                        │                                       │
            │◀── result (success/error) ───────│  (轮次结束)                            │
            │◀── session_state_changed (idle) ───│                                       │
            │                                        │                                       │
            │── user message ─────────────▶│  (下一轮)                              │
            │   ...                                  │   ...                                 │
```

---

> **文档来源**：`src/entrypoints/sdk/coreSchemas.ts` + `src/entrypoints/sdk/controlSchemas.ts` + `src/cli/transports/ccrClient.ts` + `src/cli/transports/SSETransport.ts`
