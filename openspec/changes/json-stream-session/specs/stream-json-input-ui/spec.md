## ADDED Requirements

### Requirement: Message input bar for stream sessions
The system SHALL display a message input bar at the bottom of stream-json session tabs. The input bar SHALL NOT be displayed for hook-based (monitored) sessions. The input bar SHALL consist of a multi-line text input and a send button.

#### Scenario: Input bar visible for stream session
- **WHEN** the active tab is a stream-json session
- **THEN** a message input bar is rendered at the bottom of the tab content area

#### Scenario: Input bar hidden for hook session
- **WHEN** the active tab is a hook-based (monitored) session
- **THEN** no message input bar is rendered

### Requirement: Send message on Enter, newline on Shift+Enter
The system SHALL send the message when the user presses Enter without modifiers. Pressing Shift+Enter SHALL insert a newline in the input field.

#### Scenario: Enter sends message
- **WHEN** user types text and presses Enter
- **THEN** the text is sent as a prompt to the Claude Code session and the input field is cleared

#### Scenario: Shift+Enter inserts newline
- **WHEN** user presses Shift+Enter
- **THEN** a newline character is inserted at the cursor position without sending

#### Scenario: Empty message is ignored
- **WHEN** user presses Enter with only whitespace in the input
- **THEN** no message is sent and the input is not cleared

### Requirement: Disable input while turn is in progress
The system SHALL disable the input field and send button while the Claude Code session is processing a turn (phase is `thinking`, `processing`, or `compacting`). The input SHALL be re-enabled when the turn completes (phase becomes `done`, `idle`, `waitingForApproval`, or `waitingForInput`).

#### Scenario: Input disabled during processing
- **WHEN** the session phase transitions to `thinking` or `processing`
- **THEN** the input field and send button are visually disabled and non-interactive

#### Scenario: Input re-enabled after turn completes
- **WHEN** the session phase transitions to `done`, `idle`, `waitingForApproval`, or `waitingForInput`
- **THEN** the input field and send button are re-enabled and the input field receives focus

### Requirement: Visual busy indicator
The system SHALL show a visual indicator (e.g., a spinner or pulsing dot) on or near the input bar when the turn is in progress.

#### Scenario: Spinner shown during processing
- **WHEN** the session is in `thinking` or `processing` phase
- **THEN** a spinner or pulsing animation is displayed near the input bar

#### Scenario: Spinner hidden when idle
- **WHEN** the session is in `idle`, `done`, `waitingForApproval`, or `waitingForInput` phase
- **THEN** the spinner or animation is hidden
