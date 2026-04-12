## ADDED Requirements

### Requirement: Parse tool_use blocks as toolCall ChatItems
StreamAdapterManager SHALL create a `toolCall` ChatItem with status `running` when receiving a `tool_use` event from StreamSession. The ChatItem SHALL include `id` (from toolUseId), tool name, and tool input.

#### Scenario: Tool call detected in assistant message
- **WHEN** StreamSession emits a `tool_use` event with toolUseId, toolName, and toolInput
- **THEN** StreamAdapterManager SHALL create a ChatItem of type `toolCall` with `id = toolUseId`, `tool.name = toolName`, `tool.input = toolInput`, `tool.status = "running"`

### Requirement: Parse tool_result from user messages
StreamSession SHALL parse `user` messages containing `tool_use_result` and emit a `tool_result` event with toolUseId, content, and isError flag.

#### Scenario: Successful tool result received
- **WHEN** Claude Code sends a `user` message with `tool_use_result` field containing `tool_use_id` and `content`
- **THEN** StreamSession SHALL emit a `tool_result` event with `toolUseId`, `content`, and `isError = false`

#### Scenario: Error tool result received
- **WHEN** Claude Code sends a `user` message with `tool_use_result` field where `is_error = true`
- **THEN** StreamSession SHALL emit a `tool_result` event with `toolUseId`, `content`, and `isError = true`

### Requirement: Update toolCall ChatItem with tool result
StreamAdapterManager SHALL update the matching `toolCall` ChatItem when receiving a `tool_result` event, setting status to `success` or `error` and storing the result text.

#### Scenario: Tool result updates running toolCall
- **WHEN** StreamAdapterManager receives a `tool_result` event with toolUseId matching an existing `toolCall` ChatItem
- **THEN** the ChatItem SHALL be updated with `tool.status = "success"` (or `"error"` if isError), `tool.result = content`

#### Scenario: Tool result with no matching ChatItem
- **WHEN** StreamAdapterManager receives a `tool_result` event with toolUseId that does NOT match any existing ChatItem
- **THEN** the event SHALL be silently ignored

### Requirement: Clean up stale running toolCalls on result
StreamAdapterManager SHALL mark all remaining `running` toolCall ChatItems as `success` when the `result` event is received for a session turn.

#### Scenario: Result event cleans up unfinished tools
- **WHEN** a `result` event is received for a session
- **THEN** all `toolCall` ChatItems with `status = "running"` SHALL be updated to `status = "success"`
