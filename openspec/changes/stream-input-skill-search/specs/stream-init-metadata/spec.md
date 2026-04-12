## ADDED Requirements

### Requirement: StreamSession SHALL emit session_init event with init metadata

当 `StreamSession` 从 CLI stdout 接收到 `type: "system"` 且 `subtype: "init"` 的 NDJSON 消息时，SHALL 提取 `skills`（string[]）和 `slash_commands`（string[]）字段，并 emit 一个 `type: "session_init"` 事件。

#### Scenario: Normal init message received

- **WHEN** CLI stdout 输出 `{"type":"system","subtype":"init","skills":["commit","simplify"],"slash_commands":["/commit","/simplify"],"session_id":"abc123",...}`
- **THEN** `StreamSession` SHALL emit `{ type: "session_init", initMetadata: { skills: ["commit","simplify"], slashCommands: ["/commit","/simplify"] } }`

#### Scenario: Init message with missing optional fields

- **WHEN** CLI stdout 输出 `{"type":"system","subtype":"init","session_id":"abc123"}`（无 skills 和 slash_commands 字段）
- **THEN** `StreamSession` SHALL emit `{ type: "session_init", initMetadata: { skills: [], slashCommands: [] } }`

#### Scenario: Init message only fires once

- **WHEN** CLI 会话生命周期内只发送一次 `system/init`
- **THEN** `session_init` 事件 SHALL 只被 emit 一次

### Requirement: StreamEventType SHALL include session_init type

`StreamEventType` 联合类型 SHALL 包含 `'session_init'` 字符串字面量。`StreamEvent` 接口 SHALL 包含可选的 `initMetadata` 字段。

#### Scenario: Type system accepts session_init events

- **WHEN** 代码构造一个 `{ type: "session_init", initMetadata: { skills: [...], slashCommands: [...] } }` 对象
- **THEN** 该对象 SHALL 满足 `StreamEvent` 类型约束，无 TypeScript 编译错误

### Requirement: StreamAdapter SHALL forward init metadata to renderer

`StreamAdapterManager._handleEvent()` 收到 `session_init` 事件后，SHALL 将 skills 和 slash_commands 存储到 `SessionStore`，并通过 `session:update` IPC 广播给渲染进程。

#### Scenario: Init metadata forwarded via session:update

- **WHEN** `StreamAdapterManager` 收到 `session_init` 事件
- **THEN** SHALL 调用 `_broadcast('session:update', { sessionId, phase, initMetadata: { skills, slashCommands } })` 将数据传递给渲染进程

### Requirement: SessionStore SHALL persist init metadata

`SessionStore` SHALL 在会话状态中存储 init 元数据（skills、slashCommands），使其可通过 `get(sessionId)` 访问。

#### Scenario: Init metadata accessible from store

- **WHEN** `SessionStore` 处理了 `session_init` 事件
- **THEN** 后续调用 `store.get(sessionId)` SHALL 返回包含 `initMetadata.skills` 和 `initMetadata.slashCommands` 的会话数据
