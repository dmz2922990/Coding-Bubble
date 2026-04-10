## ADDED Requirements

### Requirement: PID propagation from hook
The Python hook script SHALL include the process ID (`pid`) in every event payload sent to the socket server. The session-store SHALL persist this PID in `SessionState.pid`.

#### Scenario: Session start event carries PID
- **WHEN** a `SessionStart` hook event is received
- **THEN** the event payload SHALL contain a `pid` field with the numeric process ID of the Claude Code process
- **AND** the session-store SHALL store this value in `SessionState.pid`

#### Scenario: Subsequent events update PID if changed
- **WHEN** any hook event (UserPromptSubmit, PreToolUse, etc.) is received with a `pid` field
- **THEN** the session-store SHALL update `SessionState.pid` if the value differs from the stored value

### Requirement: Jump button in session tab header
Each session tab SHALL display a "jump to terminal" button in the header area, positioned to the right of the phase badge. The button SHALL be visible for all sessions regardless of phase.

#### Scenario: Button always visible
- **WHEN** a session tab is rendered
- **THEN** a jump button (icon button) SHALL appear to the right of the phase status badge
- **AND** the button SHALL be clickable regardless of session phase (idle, processing, waitingForInput, waitingForApproval, compacting, ended)

#### Scenario: Button triggers terminal jump
- **WHEN** the user clicks the jump button
- **THEN** the app SHALL invoke the terminal jump action for that session via IPC

### Requirement: Terminal detection via process tree analysis
The system SHALL detect which terminal application hosts a Claude Code session by tracing the process tree from the session PID upward until a known terminal process name is matched.

#### Scenario: Terminal detected successfully
- **WHEN** the jump action is triggered for a session with a valid PID
- **THEN** the system SHALL execute `ps -eo pid,ppid,tty,comm` and trace parent processes
- **AND** SHALL return the terminal application name, Bundle ID, and TTY if a known terminal is found

#### Scenario: Terminal not detected
- **WHEN** the process tree trace reaches the root (PID 1) without matching a known terminal
- **THEN** the system SHALL proceed to the fallback activation strategy

### Requirement: Layered terminal activation
The system SHALL attempt terminal activation in a layered fallback order: (1) tmux + yabai for tmux sessions, (2) terminal-specific AppleScript/CLI commands, (3) generic Bundle ID activation.

#### Scenario: tmux session with yabai
- **WHEN** the session is running inside tmux and yabai is available
- **THEN** the system SHALL locate the exact tmux pane via `tmux list-panes` and PID matching
- **AND** SHALL switch to that pane via `tmux select-window` + `tmux select-pane`
- **AND** SHALL focus the hosting window via `yabai -m window --focus`

#### Scenario: iTerm2 terminal
- **WHEN** the detected terminal is iTerm2
- **THEN** the system SHALL use AppleScript to find the session with matching TTY
- **AND** SHALL select that tab and session, then activate the window

#### Scenario: Ghostty terminal
- **WHEN** the detected terminal is Ghostty
- **THEN** the system SHALL use AppleScript to find the terminal with matching working directory
- **AND** SHALL focus that terminal

#### Scenario: Generic Bundle ID fallback
- **WHEN** no terminal-specific strategy is available or all fail
- **THEN** the system SHALL activate the terminal application by its Bundle ID using AppleScript `activate` command
- **AND** if no terminal was detected, SHALL attempt activation of common terminals in priority order

### Requirement: IPC channel for terminal jump
The main process SHALL expose an IPC handler `session:jump-to-terminal` that accepts a session ID, performs terminal detection and activation, and returns success/failure status.

#### Scenario: Successful jump
- **WHEN** the renderer sends `session:jump-to-terminal` with a valid session ID
- **THEN** the main process SHALL look up the session's PID and cwd
- **AND** SHALL execute the layered terminal activation
- **AND** SHALL return a success response

#### Scenario: Session not found
- **WHEN** the renderer sends `session:jump-to-terminal` with an unknown session ID
- **THEN** the main process SHALL return an error response

### Requirement: Preload API exposure
The preload script SHALL expose a `session.jumpToTerminal(sessionId)` method to the renderer process that invokes the `session:jump-to-terminal` IPC handler.

#### Scenario: Renderer calls jump API
- **WHEN** the renderer calls `window.electronAPI.session.jumpToTerminal('session-123')`
- **THEN** the preload SHALL invoke the `session:jump-to-terminal` IPC handler with the session ID
- **AND** SHALL return the result promise to the renderer

### Requirement: Platform extensibility
The terminal jumper module SHALL define a `PlatformTerminalJumper` interface with `detectTerminal` and `focusTerminal` methods. The macOS implementation SHALL be loaded when `process.platform === 'darwin'`.

#### Scenario: macOS platform
- **WHEN** the app runs on macOS
- **THEN** the macOS-specific terminal jumper implementation SHALL be used

#### Scenario: Windows platform (future)
- **WHEN** the app runs on Windows
- **THEN** the system SHALL gracefully handle the absence of a Windows implementation (no-op or log warning) until a Windows jumper is implemented
