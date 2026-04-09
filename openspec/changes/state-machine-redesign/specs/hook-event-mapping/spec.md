## ADDED Requirements

### Requirement: UserPromptSubmit transitions to thinking
The system SHALL transition session to `thinking` phase when a `UserPromptSubmit` event is received.

#### Scenario: User submits a prompt
- **WHEN** `UserPromptSubmit` event is received for a session in `idle` phase
- **THEN** the session SHALL transition to `thinking`

#### Scenario: User submits prompt while in waitingForInput
- **WHEN** `UserPromptSubmit` event is received for a session in `waitingForInput` phase
- **THEN** the session SHALL transition to `thinking`

### Requirement: PreToolUse transitions to processing
The system SHALL transition session to `processing` phase when a `PreToolUse` event is received.

#### Scenario: Tool use starts after thinking
- **WHEN** `PreToolUse` event is received for a session in `thinking` phase
- **THEN** the session SHALL transition to `processing`

#### Scenario: Tool use starts during processing
- **WHEN** `PreToolUse` event is received for a session already in `processing` phase
- **THEN** the session SHALL remain in `processing`

### Requirement: PostToolUse maintains processing state
The system SHALL keep the session in `processing` phase when a `PostToolUse` event is received, unless currently in `waitingForApproval`.

#### Scenario: Tool completes during processing
- **WHEN** `PostToolUse` event is received for a session in `processing` phase
- **THEN** the session SHALL remain in `processing`

#### Scenario: Tool completes after auto-approved permission
- **WHEN** `PostToolUse` event is received for a session in `waitingForApproval` phase
- **THEN** the session SHALL transition to `processing`

### Requirement: PostToolUseFailure transitions to error
The system SHALL transition session to `error` phase when a `PostToolUseFailure` event is received. This is a new event type that SHALL be monitored.

#### Scenario: Tool execution fails
- **WHEN** `PostToolUseFailure` event is received for a session in `processing` phase
- **THEN** the session SHALL transition to `error`

### Requirement: Stop transitions to done
The system SHALL transition session to `done` phase when a `Stop` event is received. The `done` phase is an ONESHOT state that auto-reverts to `idle` after 3 seconds.

#### Scenario: Task completes successfully
- **WHEN** `Stop` event is received for a session in `processing` phase
- **THEN** the session SHALL transition to `done`

### Requirement: StopFailure transitions to error
The system SHALL transition session to `error` phase when a `StopFailure` event is received. This is a new event type that SHALL be monitored.

#### Scenario: Task fails to complete
- **WHEN** `StopFailure` event is received for a session in `processing` phase
- **THEN** the session SHALL transition to `error`

### Requirement: SubagentStart transitions to processing
The system SHALL transition session to `processing` phase when a `SubagentStart` event is received. This is a new event type that SHALL be monitored.

#### Scenario: Sub-agent starts during thinking
- **WHEN** `SubagentStart` event is received for a session in `thinking` phase
- **THEN** the session SHALL transition to `processing`

### Requirement: SubagentStop does not trigger state transition
The system SHALL NOT change session phase when a `SubagentStop` event is received. The parent session's state SHALL be driven by its own events.

#### Scenario: Sub-agent stops
- **WHEN** `SubagentStop` event is received for a session
- **THEN** the session phase SHALL remain unchanged

### Requirement: PostCompact transitions from compacting
The system SHALL transition session from `compacting` to `processing` when a `PostCompact` event is received. This is a new event type that SHALL be monitored.

#### Scenario: Context compression completes
- **WHEN** `PostCompact` event is received for a session in `compacting` phase
- **THEN** the session SHALL transition to `processing`

### Requirement: Hook installer registers all monitored events
The `HOOK_EVENTS` list in `hook-installer.ts` SHALL include all event types that the state machine processes. New events SHALL be added: `PostToolUseFailure`, `StopFailure`, `SubagentStart`, `PostCompact`.

#### Scenario: All hook events are registered
- **WHEN** hooks are installed
- **THEN** the Claude settings.json SHALL contain hook entries for all 14 event types including the 4 new ones

### Requirement: Unknown events are safely ignored
The system SHALL silently ignore any hook event that is not in the defined event list, without error or state change.

#### Scenario: Unrecognized event received
- **WHEN** an unrecognized hook event name is received
- **THEN** no state change SHALL occur and no error SHALL be thrown
