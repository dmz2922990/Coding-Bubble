## ADDED Requirements

### Requirement: Notification bubble visibility control
The system SHALL display a notification bubble above the floating ball when there are sessions requiring user intervention and the main panel is not open.

#### Scenario: Bubble appears when intervention needed
- **WHEN** a session enters `waitingForApproval` or `waitingForInput` state
- **AND** the main panel window is not visible
- **THEN** the notification bubble SHALL appear above the floating ball

#### Scenario: Bubble hides when main panel opens
- **WHEN** the user opens the main panel window
- **THEN** the notification bubble SHALL immediately hide

#### Scenario: Bubble hides when no more interventions
- **WHEN** all sessions requiring intervention are resolved
- **THEN** the notification bubble SHALL automatically disappear

### Requirement: Notification bubble UI layout
The system SHALL render a list of intervention items in the bubble, each showing session name and status.

#### Scenario: Single session notification
- **WHEN** one session requires intervention
- **THEN** the bubble SHALL display one row with the project name and status label

#### Scenario: Multiple sessions notification
- **WHEN** multiple sessions require intervention
- **THEN** the bubble SHALL display multiple rows, each showing project name and status
- **AND** the bubble height SHALL adjust to accommodate all rows (up to a maximum)

#### Scenario: Bubble positioning
- **WHEN** the bubble is displayed
- **THEN** it SHALL appear above the floating ball
- **AND** it SHALL not extend beyond screen boundaries

### Requirement: Notification bubble styling
The bubble SHALL have visual distinction based on intervention type.

#### Scenario: Approval intervention styling
- **WHEN** a session requires tool approval
- **THEN** its row SHALL display with an orange indicator

#### Scenario: Input intervention styling
- **WHEN** a session requires user input
- **THEN** its row SHALL display with a blue indicator
