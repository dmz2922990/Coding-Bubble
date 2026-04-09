## ADDED Requirements

### Requirement: Session state machine supports 9 phase types
The system SHALL define session phase types: `idle`, `thinking`, `processing`, `done`, `error`, `waitingForInput`, `waitingForApproval`, `compacting`, `ended`.

#### Scenario: New session starts in idle phase
- **WHEN** a new session is created via `SessionStart` event
- **THEN** the session phase SHALL be `idle`

#### Scenario: Session ends in ended phase
- **WHEN** a `SessionEnd` event is received
- **THEN** the session phase SHALL transition to `ended` and the session SHALL be removed

### Requirement: Valid state transitions are enforced
The system SHALL enforce a valid transition matrix. Invalid transitions SHALL be silently rejected and logged.

```
idle            → [thinking, processing, waitingForApproval, compacting]
thinking        → [processing, done, error, waitingForApproval, compacting]
processing      → [thinking, done, error, waitingForInput, waitingForApproval, compacting]
done            → [idle, thinking]
error           → [idle, thinking]
waitingForInput → [thinking, processing, idle, compacting]
waitingForApproval → [processing, idle, waitingForInput]
compacting      → [processing, idle, waitingForInput]
ended           → []
```

#### Scenario: Valid transition succeeds
- **WHEN** session is in `thinking` phase and `processing` transition is requested
- **THEN** the session phase SHALL change to `processing`

#### Scenario: Invalid transition is rejected
- **WHEN** session is in `idle` phase and `done` transition is requested
- **THEN** the session phase SHALL remain `idle` and the invalid attempt SHALL be logged

### Requirement: ONESHOT states auto-revert after timeout
The states `done` and `error` SHALL automatically revert to `idle` after a minimum display duration.

- `done` SHALL revert to `idle` after 3 seconds
- `error` SHALL revert to `idle` after 5 seconds

#### Scenario: Done state auto-reverts to idle
- **WHEN** session transitions to `done`
- **THEN** after 3 seconds with no new events, the session phase SHALL automatically revert to `idle`

#### Scenario: New event cancels ONESHOT revert
- **WHEN** session transitions to `done` and a `UserPromptSubmit` event arrives within 3 seconds
- **THEN** the session SHALL transition to `thinking` and the auto-revert timer SHALL be cancelled

#### Scenario: Error state auto-reverts to idle
- **WHEN** session transitions to `error`
- **THEN** after 5 seconds with no new events, the session phase SHALL automatically revert to `idle`

### Requirement: State priority arbitration for multi-session display
The system SHALL define a priority order for session phases. When multiple sessions are active, the system SHALL expose the highest-priority phase for display.

```
error(8) > waitingForApproval(7) > done(6) > waitingForInput(5) > compacting(4) > processing(3) > thinking(2) > idle(1) > ended(0)
```

#### Scenario: Error session takes priority over processing sessions
- **WHEN** session A is in `error` and session B is in `processing`
- **THEN** the display state SHALL be `error`

#### Scenario: Approval takes highest priority after error
- **WHEN** session A is `waitingForApproval` and session B is `done`
- **THEN** the display state SHALL be `waitingForApproval`

### Requirement: Session phase includes context for waitingForApproval
The `waitingForApproval` phase SHALL carry a `PermissionContext` containing `toolUseId`, `toolName`, `toolInput`, and `receivedAt`. No other phase type carries additional context.

#### Scenario: PermissionRequest carries tool context
- **WHEN** a `PermissionRequest` event is processed
- **THEN** the session phase SHALL be `waitingForApproval` with context containing the tool details

### Requirement: Permission resolution transitions state
- **WHEN** a permission is resolved with `allow` decision, the session SHALL transition to `processing`
- **WHEN** a permission is resolved with `deny` decision, the session SHALL transition to `idle`

#### Scenario: Approved permission resumes processing
- **WHEN** user approves a pending permission request
- **THEN** the session SHALL transition from `waitingForApproval` to `processing`
