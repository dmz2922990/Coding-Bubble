## ADDED Requirements

### Requirement: Bubble row click handling
The system SHALL handle click events on notification bubble rows.

#### Scenario: Click opens main panel
- **WHEN** the user clicks a row in the notification bubble
- **THEN** the main panel window SHALL open if not already visible

#### Scenario: Click triggers navigation
- **WHEN** the user clicks a row in the notification bubble
- **THEN** the main panel SHALL navigate to the corresponding session tab

#### Scenario: Bubble hides after click
- **WHEN** the user clicks a row in the notification bubble
- **THEN** the notification bubble SHALL hide after the main panel opens

### Requirement: Session tab navigation
The system SHALL support programmatic navigation to a specific session tab.

#### Scenario: Navigate to existing session tab
- **WHEN** navigation to a session tab is requested
- **AND** the session tab already exists
- **THEN** the tab SHALL be activated (switched to)

#### Scenario: Navigate creates new tab if needed
- **WHEN** navigation to a session tab is requested
- **AND** the session tab does not exist
- **THEN** a new tab SHALL be created for that session
- **AND** the new tab SHALL be activated

### Requirement: IPC communication for navigation
The system SHALL use IPC to communicate between floating ball and main panel.

#### Scenario: Send navigation request
- **WHEN** a bubble row is clicked
- **THEN** the floating ball renderer SHALL send `panel:navigate-to-session` IPC message
- **AND** the message SHALL include the target sessionId

#### Scenario: Receive navigation request
- **WHEN** the main process receives `panel:navigate-to-session` message
- **THEN** it SHALL ensure the panel window is open
- **AND** it SHALL forward the navigation command to the panel renderer

#### Scenario: Handle navigation in panel
- **WHEN** the panel renderer receives navigation command
- **THEN** it SHALL activate or create the session tab
