## ADDED Requirements

### Requirement: Parse task_started system messages
StreamSession SHALL parse `system` messages with `subtype: "task_started"` and emit a `task_notification` event with phase `started`, taskId, and description.

#### Scenario: Background task starts
- **WHEN** Claude Code sends a `system` message with `subtype: "task_started"` containing `task_id` and `description`
- **THEN** StreamSession SHALL emit a `task_notification` event with `phase = "started"`, `taskId`, and `description`

### Requirement: Parse task_progress system messages
StreamSession SHALL parse `system` messages with `subtype: "task_progress"` and emit a `task_notification` event with phase `progress`, taskId, description, and usage stats.

#### Scenario: Task progress update
- **WHEN** Claude Code sends a `system` message with `subtype: "task_progress"` containing `task_id`, `description`, and `usage`
- **THEN** StreamSession SHALL emit a `task_notification` event with `phase = "progress"`, `taskId`, `description`, and usage fields

### Requirement: Parse task_notification system messages
StreamSession SHALL parse `system` messages with `subtype: "task_notification"` and emit a `task_notification` event with phase from status, taskId, and summary.

#### Scenario: Task completes successfully
- **WHEN** Claude Code sends a `system` message with `subtype: "task_notification"`, `status: "completed"`, and `summary`
- **THEN** StreamSession SHALL emit a `task_notification` event with `phase = "completed"`, `taskId`, and `summary`

#### Scenario: Task fails
- **WHEN** Claude Code sends a `system` message with `subtype: "task_notification"` and `status: "failed"`
- **THEN** StreamSession SHALL emit a `task_notification` event with `phase = "failed"`, `taskId`, and `summary`

### Requirement: Parse post_turn_summary system messages
StreamSession SHALL parse `system` messages with `subtype: "post_turn_summary"` and emit a `post_turn_summary` event with title and description.

#### Scenario: Post-turn summary received
- **WHEN** Claude Code sends a `system` message with `subtype: "post_turn_summary"` containing `title` and `description`
- **THEN** StreamSession SHALL emit a `post_turn_summary` event with `title` and `description`

### Requirement: Display task notifications as system messages
StreamAdapterManager SHALL convert `task_notification` and `post_turn_summary` events into `system` ChatItems for renderer display.

#### Scenario: Task started creates system message
- **WHEN** StreamAdapterManager receives a `task_notification` event with phase `started`
- **THEN** a `system` ChatItem SHALL be created with content "📌 任务启动: {description}"

#### Scenario: Task completed creates system message
- **WHEN** StreamAdapterManager receives a `task_notification` event with phase `completed`
- **THEN** a `system` ChatItem SHALL be created with content "✅ 任务完成: {summary}"

#### Scenario: Task failed creates system message
- **WHEN** StreamAdapterManager receives a `task_notification` event with phase `failed`
- **THEN** a `system` ChatItem SHALL be created with content "❌ 任务失败: {summary}"

#### Scenario: Post-turn summary creates system message
- **WHEN** StreamAdapterManager receives a `post_turn_summary` event
- **THEN** a `system` ChatItem SHALL be created with content "📋 {title}: {description}"
