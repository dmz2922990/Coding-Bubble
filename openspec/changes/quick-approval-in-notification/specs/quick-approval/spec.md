## ADDED Requirements

### Requirement: Notification bubble shows inline Allow button for normal permissions
When a permission request notification is displayed in the floating ball bubble and the tool is NOT AskUserQuestion, the notification row SHALL display an inline "允许" button. The button SHALL be styled distinctly (e.g. accent color background) to differentiate it from the notification text area.

#### Scenario: Normal permission notification shows Allow button
- **WHEN** the main window is not visible AND a permission request arrives for a non-AskUserQuestion tool (e.g. Read, Edit, Bash)
- **THEN** the floating ball notification bubble displays the notification row with an inline "允许" button

#### Scenario: AskUserQuestion notification does NOT show Allow button
- **WHEN** the main window is not visible AND a permission request arrives for AskUserQuestion
- **THEN** the notification row displays WITHOUT the "允许" button, showing only the existing text and dismiss behavior

### Requirement: Clicking Allow button approves permission without opening main window
Clicking the "允许" button on a notification row SHALL call the appropriate approve IPC (`session.approve`, `stream.approve`, or `remote.*.approve` depending on session source) to authorize the tool. The main window SHALL NOT be opened as a side effect of this action. After approval, the notification for that session SHALL be dismissed.

#### Scenario: Quick approval for hook session
- **WHEN** user clicks the "允许" button on a hook session's approval notification
- **THEN** `session.approve(sessionId)` is called AND the notification is dismissed AND the main window remains closed

#### Scenario: Quick approval for stream session
- **WHEN** user clicks the "允许" button on a stream session's approval notification
- **THEN** `stream.approve(sessionId)` is called AND the notification is dismissed AND the main window remains closed

#### Scenario: Quick approval for remote sessions
- **WHEN** user clicks the "允许" button on a remote session's approval notification
- **THEN** the appropriate remote approve IPC is called AND the notification is dismissed AND the main window remains closed

### Requirement: Clicking notification row preserves existing navigation behavior
Clicking the notification row text area (outside the "允许" button) SHALL continue to call `navigateToSession(sessionId)` to open the main window and navigate to the corresponding session, unchanged from current behavior.

#### Scenario: Click notification row to navigate
- **WHEN** user clicks the notification text area (not the Allow button or dismiss button)
- **THEN** the main window opens and navigates to the session, same as current behavior

### Requirement: Quick approval setting with default enabled
The settings panel notification tab SHALL include a "快速确认" toggle switch. This setting SHALL be enabled by default. When disabled, the "允许" button SHALL NOT be displayed on any notification, regardless of permission type.

#### Scenario: Setting enabled by default
- **WHEN** the user has never changed the quick approval setting
- **THEN** the "快速确认" toggle is ON and the "允许" button appears on eligible notifications

#### Scenario: User disables quick approval
- **WHEN** the user toggles "快速确认" OFF in settings
- **THEN** no "允许" button is shown on any notification, and approval notifications behave exactly as before

#### Scenario: User re-enables quick approval
- **WHEN** the user toggles "快速确认" back ON
- **THEN** the "允许" button resumes appearing on eligible notifications

### Requirement: BubbleNotification carries AskUserQuestion flag
The `BubbleNotification` data structure SHALL include an `isAskUserQuestion` boolean field. The main process SHALL set this field to `true` when the pending permission's `toolName === 'AskUserQuestion'`, and `false` otherwise. The renderer SHALL use this field to determine whether to render the "允许" button.

#### Scenario: Non-AskUserQuestion tool notification
- **WHEN** a permission request is generated for tool "Edit"
- **THEN** the BubbleNotification has `isAskUserQuestion: false`

#### Scenario: AskUserQuestion tool notification
- **WHEN** a permission request is generated for tool "AskUserQuestion"
- **THEN** the BubbleNotification has `isAskUserQuestion: true`
