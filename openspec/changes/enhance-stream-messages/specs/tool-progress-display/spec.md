## ADDED Requirements

### Requirement: StreamSession parses tool_progress SDK messages
StreamSession SHALL parse `tool_progress` SDK messages and emit a `tool_progress` internal event with toolUseId, toolName, and elapsed time.

#### Scenario: Tool progress received
- **WHEN** Claude Code CLI sends `{ type: "tool_progress", tool_use_id: "xxx", tool_name: "Bash", elapsed_time_seconds: 5 }`
- **THEN** StreamSession emits `{ type: 'tool_progress', toolUseId: 'xxx', toolName: 'Bash', elapsedSeconds: 5 }`

### Requirement: StreamAdapter updates existing toolCall ChatItem with progress
StreamAdapter SHALL handle `tool_progress` events by updating the matching `toolCall` ChatItem's elapsed time field. If no matching toolCall exists, the event SHALL be silently ignored.

#### Scenario: Progress updates existing tool call
- **WHEN** StreamAdapter receives `{ type: 'tool_progress', toolUseId: 'tu_123', elapsedSeconds: 8 }`
- **THEN** the ChatItem with matching toolUseId is updated with elapsedSeconds = 8

#### Scenario: No matching tool call
- **WHEN** StreamAdapter receives `{ type: 'tool_progress', toolUseId: 'tu_unknown', elapsedSeconds: 3 }`
- **THEN** the event is ignored silently, no error is raised

### Requirement: Renderer displays elapsed time on running tool calls
The renderer SHALL display the elapsed time next to running tool calls. The time SHALL update in real-time while the tool is active.

#### Scenario: Running tool shows timer
- **WHEN** a toolCall ChatItem has status `running` and elapsedSeconds > 0
- **THEN** the elapsed time is displayed next to the tool name (e.g., "Bash · 8s")

### Requirement: StreamSession parses tool_use_summary SDK messages
StreamSession SHALL parse `tool_use_summary` SDK messages and emit a `tool_summary` internal event.

#### Scenario: Tool summary received
- **WHEN** Claude Code CLI sends `{ type: "tool_use_summary", summary: "Read 2 files, wrote 1 file" }`
- **THEN** StreamSession emits `{ type: 'tool_summary', summary: "Read 2 files, wrote 1 file" }`

### Requirement: StreamAdapter adds tool summary as inline system message
StreamAdapter SHALL handle `tool_summary` events by adding a lightweight inline system message to the chat history, providing a condensed view of tool activity.

#### Scenario: Tool summary displayed
- **WHEN** StreamAdapter receives `{ type: 'tool_summary', summary: "Read 2 files, wrote 1 file" }`
- **THEN** a new ChatItem with `type: 'system'` containing the summary text is appended to session history
