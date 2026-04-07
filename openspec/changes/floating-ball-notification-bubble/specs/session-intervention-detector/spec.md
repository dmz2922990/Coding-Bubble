## ADDED Requirements

### Requirement: Intervention state detection
The system SHALL detect when a session enters a state requiring user intervention.

#### Scenario: Detect waiting for approval
- **WHEN** a session transitions to `waitingForApproval` phase
- **THEN** the system SHALL add this session to the pending interventions list

#### Scenario: Detect waiting for input
- **WHEN** a session transitions to `waitingForInput` phase
- **THEN** the system SHALL add this session to the pending interventions list

#### Scenario: Ignore other phases
- **WHEN** a session is in `idle`, `processing`, `compacting`, or `ended` phase
- **THEN** the system SHALL NOT add it to the pending interventions list

### Requirement: Intervention list maintenance
The system SHALL maintain an accurate list of sessions requiring intervention.

#### Scenario: Remove resolved intervention
- **WHEN** a session transitions out of `waitingForApproval` or `waitingForInput`
- **THEN** the system SHALL remove this session from the pending interventions list

#### Scenario: Handle session end
- **WHEN** a session ends while in the pending interventions list
- **THEN** the system SHALL remove this session from the list

#### Scenario: Provide intervention list to UI
- **WHEN** the notification bubble requests the current intervention list
- **THEN** the system SHALL return all sessions currently requiring intervention
- **AND** each entry SHALL include sessionId, projectName, phase type, and toolName (if applicable)

### Requirement: Intervention count tracking
The system SHALL track the count of pending interventions.

#### Scenario: Count increases
- **WHEN** a new session enters intervention state
- **THEN** the pending count SHALL increment

#### Scenario: Count decreases
- **WHEN** a session leaves intervention state
- **THEN** the pending count SHALL decrement

#### Scenario: Count reaches zero
- **WHEN** the last session leaves intervention state
- **THEN** the pending count SHALL be zero
- **AND** the notification bubble SHALL be hidden
