## ADDED Requirements

### Requirement: StreamSession parses session_state_changed messages
StreamSession SHALL parse `system` SDK messages with `subtype = "session_state_changed"` and emit a `session_state` internal event with the state value (idle / running / requires_action).

#### Scenario: State changes to idle
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "session_state_changed", state: "idle" }`
- **THEN** StreamSession emits `{ type: 'session_state', state: 'idle' }`

#### Scenario: State changes to running
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "session_state_changed", state: "running" }`
- **THEN** StreamSession emits `{ type: 'session_state', state: 'running' }`

#### Scenario: State changes to requires_action
- **WHEN** Claude Code CLI sends `{ type: "system", subtype: "session_state_changed", state: "requires_action" }`
- **THEN** StreamSession emits `{ type: 'session_state', state: 'requires_action' }`

### Requirement: StreamAdapter maps SDK states to UI phases
StreamAdapter SHALL translate `session_state` events into SessionStore phase transitions using the following mapping:
- `idle` → phase `idle`
- `running` → phase `thinking` (no active tool) or `processing` (active tool running)
- `requires_action` → phase `waitingForApproval` (pending permission) or `waitingForInput` (pending answer)

#### Scenario: Running state with no active tool
- **WHEN** StreamAdapter receives `{ type: 'session_state', state: 'running' }` and no tool_use is in progress
- **THEN** SessionStore phase transitions to `thinking`

#### Scenario: Running state with active tool
- **WHEN** StreamAdapter receives `{ type: 'session_state', state: 'running' }` and a tool_use is in progress
- **THEN** SessionStore phase transitions to `processing`

#### Scenario: Requires_action with pending permission
- **WHEN** StreamAdapter receives `{ type: 'session_state', state: 'requires_action' }` and a permission_request is pending
- **THEN** SessionStore phase transitions to `waitingForApproval`

#### Scenario: Idle state resets
- **WHEN** StreamAdapter receives `{ type: 'session_state', state: 'idle' }`
- **THEN** SessionStore phase transitions to `idle`
