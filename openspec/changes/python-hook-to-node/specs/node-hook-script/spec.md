# Specification: Node Hook Script

## ADDED Requirements

### Requirement: Node.js 钩子脚本基本功能
Node.js 版本的钩子脚本 SHALL 支持与 Python 版本相同的基本功能，包括：
- 读取标准输入的 JSON 钩子事件
- 解析和处理钩子事件
- 通过 Unix socket 与本地服务器通信
- 记录日志到 `/tmp/claude-bubble-hook.log`

#### Scenario: 正常钩子事件处理
- **WHEN** 脚本接收到有效的 JSON 钩子事件输入
- **THEN** 脚本成功解析 JSON 并提取钩子事件名称、会话 ID、工作目录等信息
- **AND** 脚本记录原始输入到日志文件

#### Scenario: 无效 JSON 输入
- **WHEN** 脚本接收到无效的 JSON 输入
- **THEN** 脚本记录 JSON 解析错误
- **AND** 脚本退出而不执行任何操作

### Requirement: 钩子事件类型支持
Node.js 钩子脚本 SHALL 支持所有现有的钩子事件类型，包括：
- UserPromptSubmit
- PreToolUse
- PostToolUse
- PostToolUseFailure
- PermissionRequest
- Notification
- Stop
- StopFailure
- SubagentStart
- SubagentStop
- SessionStart
- SessionEnd
- PreCompact
- PostCompact

#### Scenario: PreToolUse 事件处理
- **WHEN** 脚本接收到 PreToolUse 事件
- **THEN** 脚本提取 tool_use_id 并缓存供后续 PermissionRequest 使用
- **AND** 通过 socket 发送事件信息到本地服务器

#### Scenario: PermissionRequest 事件处理
- **WHEN** 脚本接收到 PermissionRequest 事件
- **THEN** 脚本保持 socket 连接打开等待响应
- **AND** 接收到响应后输出 JSON 格式的决策结果到标准输出
- **AND** 根据决策（allow/deny）设置适当的退出码

#### Scenario: 非阻塞钩子事件
- **WHEN** 脚本接收到非 PermissionRequest 类型的事件
- **THEN** 脚本通过 socket 发送事件信息
- **AND** 立即退出（不等待响应，默认允许）

### Requirement: 日志记录功能
Node.js 钩子脚本 SHALL 实现与 Python 版本相同的日志记录功能。

#### Scenario: 记录钩子事件
- **WHEN** 脚本处理任何钩子事件
- **THEN** 在 `/tmp/claude-bubble-hook.log` 中记录事件信息
- **AND** 日志格式与 Python 版本一致

#### Scenario: 记录错误信息
- **WHEN** 脚本遇到任何错误（socket 连接、JSON 解析等）
- **THEN** 在日志文件中记录详细的错误信息
- **AND** 错误日志包含足够的上下文用于调试

### Requirement: 跳过流会话处理
Node.js 钩子脚本 SHALL 检查环境变量 `CLAUDE_BUBBLE_SKIP_HOOK`。

#### Scenario: 跳过流会话
- **WHEN** 环境变量 `CLAUDE_BUBBLE_SKIP_HOOK` 设置为 '1'
- **THEN** 脚本立即退出不执行任何操作
- **AND** 不输出任何内容到标准输出

### Requirement: Socket 通信实现
Node.js 钩子脚本 SHALL 实现与 Python 版本相同的 Unix socket 通信协议。

#### Scenario: Socket 连接
- **WHEN** 脚本尝试连接到 `/tmp/claude-bubble.sock`
- **THEN** 如果 socket 不存在，脚本安静退出（默认允许）
- **WHEN** Socket 连接成功
- **THEN** 脚本发送 JSON 格式的事件消息，包含钩子事件名称、会话 ID、工作目录、PID 和完整 payload

#### Scenario: PermissionRequest 响应接收
- **WHEN** 脚本在处理 PermissionRequest 时发送响应
- **THEN** 脚本等待接收完整的 JSON 响应（以换行符结尾）
- **AND** 响应包含决策（allow/deny）和可选原因消息
- **AND** 根据决策输出相应的 JSON 格式 hookSpecificOutput