## ADDED Requirements

### Requirement: StreamSession emits text_delta events from stream_event messages
StreamSession SHALL parse `stream_event` SDK messages from Claude Code CLI. When a `content_block_delta` event with `text_delta` type is received, StreamSession SHALL emit a `text_delta` internal event containing the full text snapshot up to that point.

#### Scenario: Text block streaming
- **WHEN** Claude Code CLI sends a `stream_event` with `event.type = "content_block_delta"` and `event.delta.type = "text_delta"`
- **THEN** StreamSession emits `{ type: 'text_delta', content: <full snapshot text> }` event

#### Scenario: Non-text content blocks ignored for text_delta
- **WHEN** Claude Code CLI sends a `stream_event` with `event.type = "content_block_delta"` and `event.delta.type = "thinking_delta"` or `input_json_delta`
- **THEN** StreamSession does NOT emit a `text_delta` event for that delta

### Requirement: StreamAdapter forwards text_delta to renderer as streaming assistant message
StreamAdapter SHALL handle `text_delta` events by updating or creating a streaming assistant ChatItem in SessionStore. The streaming message SHALL be displayed in the UI with a blinking cursor indicator.

#### Scenario: First text delta creates streaming message
- **WHEN** StreamAdapter receives the first `text_delta` event for a new assistant turn
- **THEN** a new ChatItem with `type: 'assistant'` and `streaming: true` is created in session history

#### Scenario: Subsequent deltas update streaming message
- **WHEN** StreamAdapter receives subsequent `text_delta` events
- **THEN** the existing streaming ChatItem content is replaced with the latest snapshot text

#### Scenario: Complete assistant message replaces streaming
- **WHEN** StreamAdapter receives a complete `assistant` SDK message (via existing `text` event)
- **THEN** the streaming ChatItem is updated with final content and `streaming` flag is set to false

### Requirement: Streaming message displays with cursor animation
The renderer SHALL display a blinking cursor at the end of streaming assistant messages. When the message stops streaming (complete), the cursor SHALL disappear.

#### Scenario: Cursor visible during streaming
- **WHEN** an assistant ChatItem has `streaming: true`
- **THEN** a blinking cursor is rendered after the text content

#### Scenario: Cursor hidden after completion
- **WHEN** an assistant ChatItem has `streaming: false` or no streaming flag
- **THEN** no cursor is rendered
