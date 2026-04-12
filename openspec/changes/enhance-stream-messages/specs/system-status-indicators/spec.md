## ADDED Requirements

### Requirement: StreamSession parses system status subtypes
StreamSession SHALL parse the following `system` SDK message subtypes and emit corresponding internal events:
- `subtype: "status"` with `status: "compacting"` → `system_status` event with `statusKind: 'compacting'`
- `subtype: "compact_boundary"` → `system_status` event with `statusKind: 'compacted'`
- `subtype: "api_retry"` → `system_status` event with `statusKind: 'api_retry'`
- `subtype: "rate_limit_event"` → `rate_limit` event

#### Scenario: Compaction started
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "status", status: "compacting" }`
- **THEN** StreamSession emits `{ type: 'system_status', statusKind: 'compacting' }`

#### Scenario: Compaction completed
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "compact_boundary" }`
- **THEN** StreamSession emits `{ type: 'system_status', statusKind: 'compacted' }`

#### Scenario: API retry
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "api_retry", attempt: 2, max_retries: 5, retry_delay_ms: 1000 }`
- **THEN** StreamSession emits `{ type: 'system_status', statusKind: 'api_retry', attempt: 2, maxRetries: 5, delayMs: 1000 }`

### Requirement: StreamSession parses rate_limit_event messages
StreamSession SHALL parse `rate_limit_event` SDK messages and emit a `rate_limit` internal event with status and reset time.

#### Scenario: Rate limit warning
- **WHEN** Claude Code CLI sends `{ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", resetsAt: 1713000000 } }`
- **THEN** StreamSession emits `{ type: 'rate_limit', status: 'allowed_warning', resetsAt: 1713000000 }`

#### Scenario: Rate limit rejected
- **WHEN** Claude Code CLI sends `{ type: "rate_limit_event", rate_limit_info: { status: "rejected" } }`
- **THEN** StreamSession emits `{ type: 'rate_limit', status: 'rejected' }`

### Requirement: StreamAdapter creates systemStatus ChatItems
StreamAdapter SHALL handle `system_status` and `rate_limit` events by creating `systemStatus` ChatItems in session history with appropriate styling:
- `compacting` → blue info style, auto-dismissed when `compacted` arrives
- `api_retry` → yellow warning style with attempt count
- `rate_limit` → red warning style

#### Scenario: Compaction indicator
- **WHEN** StreamAdapter receives `{ type: 'system_status', statusKind: 'compacting' }`
- **THEN** a `systemStatus` ChatItem is created with message "正在压缩上下文..." and blue styling

#### Scenario: API retry notification
- **WHEN** StreamAdapter receives `{ type: 'system_status', statusKind: 'api_retry', attempt: 2, maxRetries: 5 }`
- **THEN** a `systemStatus` ChatItem is created with message "API 重试中 (2/5)..." and yellow styling

#### Scenario: Rate limit warning
- **WHEN** StreamAdapter receives `{ type: 'rate_limit', status: 'allowed_warning' }`
- **THEN** a `systemStatus` ChatItem is created with message "接近速率限制" and yellow styling

### Requirement: Renderer renders systemStatus as inline status bar
The renderer SHALL render `systemStatus` ChatItems as compact, non-blocking inline status bars with color-coded backgrounds. Each status kind SHALL have a distinct visual treatment.

#### Scenario: Compacting status bar
- **WHEN** a systemStatus ChatItem with statusKind='compacting' is rendered
- **THEN** a blue-tinted inline bar with spinning indicator and "正在压缩上下文..." text is shown

#### Scenario: API retry status bar
- **WHEN** a systemStatus ChatItem with statusKind='api_retry' is rendered
- **THEN** a yellow-tinted inline bar with "API 重试中 (2/5)..." text is shown

#### Scenario: Rate limit status bar
- **WHEN** a systemStatus ChatItem with statusKind='rate_limit' is rendered
- **THEN** a red-tinted inline bar with "速率受限" text is shown
