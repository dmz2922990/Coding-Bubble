## ADDED Requirements

### Requirement: Add "+" button to create stream session
The system SHALL display a "+" button at the bottom of the session list view ("对话" tab). Clicking the button SHALL initiate a new stream-json session creation flow.

#### Scenario: "+" button visible in session list
- **WHEN** the "对话" tab is active (session list view is displayed)
- **THEN** a "+" button labeled "新建对话" is displayed at the bottom of the session list

#### Scenario: Click "+" with working directory dialog
- **WHEN** user clicks the "+" button
- **THEN** a dialog prompts the user to select a working directory (defaulting to the user's home directory)

#### Scenario: Create session after directory selection
- **WHEN** user selects a working directory and confirms
- **THEN** the main process spawns a new Claude Code stream-json process, a new tab is created with the session, and the tab becomes active

### Requirement: Stream session tab with visual distinction
Stream-json session tabs SHALL display a `⚡` prefix icon and a subtle left-border accent color. The session card in the session list view SHALL also display the lightning icon to indicate it is an interactive stream session.

#### Scenario: Stream tab shows lightning icon
- **WHEN** a stream-json session tab is rendered in the tab bar
- **THEN** the tab title is prefixed with "⚡" and the tab has a distinct accent color

#### Scenario: Session card shows lightning icon
- **WHEN** a stream-json session appears in the session list view
- **THEN** the session card displays a lightning icon to distinguish it from hook-based sessions

### Requirement: Reuse SessionTab component for message rendering
Stream-json session tabs SHALL reuse the existing `SessionTab` component for rendering chat history items (user messages, assistant messages, tool calls, thinking blocks, system messages). The message rendering behavior SHALL be identical to hook-based sessions.

#### Scenario: Stream session renders user message
- **WHEN** a user prompt is sent via the input bar
- **THEN** a right-aligned user chat item appears in the session tab message list

#### Scenario: Stream session renders assistant response
- **WHEN** Claude Code responds with text content
- **THEN** a left-aligned assistant chat item appears with markdown rendering, identical to hook-based sessions

#### Scenario: Stream session renders tool calls
- **WHEN** Claude Code invokes a tool
- **THEN** an expandable tool call item appears with tool name, input, and result, identical to hook-based sessions

#### Scenario: Stream session renders thinking blocks
- **WHEN** Claude Code produces extended thinking content
- **THEN** an expandable thinking block appears, identical to hook-based sessions

### Requirement: Permission approval UI for stream sessions
Stream-json session tabs SHALL use the existing `PermissionBar` and `AskUserQuestion` components when a `control_request` permission event is received. The approval/deny/always-allow actions SHALL write the corresponding response back to the stream session's stdin.

#### Scenario: Permission request shows approval bar
- **WHEN** a `control_request` event is received for a tool that is not AskUserQuestion
- **THEN** the PermissionBar appears at the bottom with Allow/Deny/Always Allow buttons

#### Scenario: AskUserQuestion shows question UI
- **WHEN** a `control_request` event is received for the AskUserQuestion tool
- **THEN** the question UI appears with selectable options and confirm/deny buttons

#### Scenario: User approves permission
- **WHEN** user clicks "Allow" on the PermissionBar
- **THEN** a `control_response` with `behavior: "allow"` is written to the session's stdin

#### Scenario: User denies permission
- **WHEN** user clicks "Deny" on the PermissionBar
- **THEN** a `control_response` with `behavior: "deny"` is written to the session's stdin

### Requirement: Close stream session tab
Stream-json session tabs SHALL be closable. Closing a tab SHALL trigger a graceful shutdown of the underlying Claude Code process.

#### Scenario: Close tab triggers shutdown
- **WHEN** user clicks the close button on a stream session tab
- **THEN** the tab is removed, the Claude Code child process receives a graceful shutdown (3-phase), and the session is removed from the session store

#### Scenario: Close last tab returns to session list
- **WHEN** user closes a stream session tab and no other session tabs are open
- **THEN** the view returns to the "对话" session list tab

### Requirement: IPC channels for stream session management
The main process SHALL expose the following new IPC channels to the renderer: `stream:create`, `stream:send`, `stream:destroy`, `stream:onEvent`, and `stream:resume`.

#### Scenario: Renderer creates stream session
- **WHEN** renderer invokes `stream:create` with a working directory
- **THEN** main process spawns a new Claude Code stream-json process and returns the session ID

#### Scenario: Renderer sends message
- **WHEN** renderer invokes `stream:send` with session ID and text
- **THEN** main process writes a user message to the session's stdin

#### Scenario: Renderer destroys session
- **WHEN** renderer invokes `stream:destroy` with session ID
- **THEN** main process initiates graceful shutdown of the session's child process

#### Scenario: Renderer receives stream events
- **WHEN** a stream session produces events (text, tool_use, thinking, result, permission_request)
- **THEN** main process forwards them to the renderer via `stream:onEvent` IPC channel

#### Scenario: Renderer resumes session
- **WHEN** renderer invokes `stream:resume` with a previously saved Claude session ID and working directory
- **THEN** main process spawns a new Claude Code process with `--resume <id>` flag
