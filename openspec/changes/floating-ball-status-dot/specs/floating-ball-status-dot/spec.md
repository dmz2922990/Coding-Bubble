## ADDED Requirements

### Requirement: Status dot displays aggregated session state
The floating ball SHALL display a colored status dot in the bottom-right area when the main panel is not visible. The dot color SHALL reflect the highest-priority state across all active sessions, determined by `resolveDisplayState()`.

#### Scenario: Processing session shows green dot
- **WHEN** at least one session is in `processing` state and no higher-priority state exists
- **THEN** the status dot SHALL be displayed with green color (`#4caf50`)

#### Scenario: Error takes priority over processing
- **WHEN** session A is `error` and session B is `processing`
- **THEN** the status dot SHALL be red (`#f44336`)

### Requirement: Status dot color mapping
The status dot SHALL use the following color mapping:

| State | Color | Animation |
|---|---|---|
| `thinking` | `#ab47bc` (purple) | None |
| `processing` | `#4caf50` (green) | None |
| `done` | `#66bb6a` (light green) | None |
| `error` | `#f44336` (red) | Blink |
| `waitingForApproval` | `#ff9800` (orange) | Pulse |
| `waitingForInput` | `#78909c` (blue-gray) | None |
| `compacting` | `#2196f3` (blue) | None |
| `idle` | Hidden | — |
| `ended` | Hidden | — |

#### Scenario: Waiting for approval shows orange pulsing dot
- **WHEN** a session is in `waitingForApproval` state
- **THEN** the status dot SHALL be orange (`#ff9800`) with a pulse animation

#### Scenario: Error shows red blinking dot
- **WHEN** a session is in `error` state
- **THEN** the status dot SHALL be red (`#f44336`) with a blink animation

### Requirement: Status dot is hidden when idle or no active sessions
- **WHEN** all sessions are in `idle` or `ended` state, or no sessions exist
- **THEN** the status dot SHALL NOT be displayed

#### Scenario: All sessions idle hides dot
- **WHEN** all active sessions are in `idle` state
- **THEN** no status dot SHALL be visible

### Requirement: Status dot is hidden when main panel is visible
- **WHEN** the main panel window is visible
- **THEN** the status dot SHALL NOT be displayed on the floating ball

#### Scenario: Panel opened hides status dot
- **WHEN** the user opens the main panel
- **THEN** the status dot SHALL disappear

#### Scenario: Panel closed shows status dot
- **WHEN** the user closes the main panel and sessions are active
- **THEN** the status dot SHALL appear with the correct state color

### Requirement: Main process sends display state to ball window
The main process SHALL send the resolved display state to the ball window via a `bubble:status` IPC event whenever session state changes or panel visibility changes.

#### Scenario: State change triggers status update
- **WHEN** a session state changes from `thinking` to `processing`
- **THEN** the main process SHALL send `bubble:status` event with `processing` to the ball window

### Requirement: Status dot transitions smoothly between colors
- **WHEN** the display state changes
- **THEN** the status dot SHALL transition its color smoothly over 0.3 seconds using CSS transition

#### Scenario: State change color transition
- **WHEN** the status changes from `processing` (green) to `error` (red)
- **THEN** the dot color SHALL smoothly fade from green to red over 0.3 seconds

### Requirement: Status dot does not overlap with approval badge
The status dot SHALL be positioned at the bottom-right of the ball. The existing approval badge SHALL remain at the top-right. Both indicators SHALL be visible simultaneously without overlapping.

#### Scenario: Both dot and badge visible
- **WHEN** a session is `waitingForApproval` and the user has dismissed the notification bubble
- **THEN** both the status dot (orange, bottom-right) and the badge (red, top-right) SHALL be visible without overlap
