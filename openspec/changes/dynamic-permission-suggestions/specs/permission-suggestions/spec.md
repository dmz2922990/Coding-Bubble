## ADDED Requirements

### Requirement: Parse permission_suggestions from stream path
The system SHALL extract `permission_suggestions` from `control_request` messages (subtype `can_use_tool`) in the stream/stdio path and include them in the emitted `StreamEvent`.

#### Scenario: Stream path receives control_request with suggestions
- **WHEN** Claude Code sends a `control_request` with `request.permission_suggestions` containing one or more suggestion objects
- **THEN** the emitted `StreamEvent` (type `permission_request`) SHALL include a `suggestions` field containing the parsed array

#### Scenario: Stream path receives control_request without suggestions
- **WHEN** Claude Code sends a `control_request` without `permission_suggestions`
- **THEN** the emitted `StreamEvent` SHALL have `suggestions` as an empty array

### Requirement: Parse permission_suggestions from hook path
The system SHALL extract `permission_suggestions` from the `payload` of `PermissionRequest` hook events received via the Unix domain socket.

#### Scenario: Hook path receives PermissionRequest with suggestions
- **WHEN** a `PermissionRequest` hook event arrives with `payload.permission_suggestions`
- **THEN** the `onPermissionRequest` callback SHALL receive the suggestions array as a parameter

#### Scenario: Hook path receives PermissionRequest without suggestions
- **WHEN** a `PermissionRequest` hook event arrives without `permission_suggestions` in payload
- **THEN** the callback SHALL receive an empty array

### Requirement: Merge multiple addRules suggestions
The system SHALL merge multiple `addRules` type suggestions into a single merged suggestion when more than one exists in the raw array.

#### Scenario: Two addRules suggestions from piped command
- **WHEN** raw suggestions contain two `addRules` entries (e.g., from `cmd1 && cmd2`)
- **THEN** they SHALL be merged into one suggestion with a `rules` array containing both rules flat-mapped, preserving other suggestion types unchanged

#### Scenario: Single addRules suggestion
- **WHEN** raw suggestions contain zero or one `addRules` entry
- **THEN** no merging SHALL occur and the raw array passes through unchanged

### Requirement: Store suggestions with pending permission
The system SHALL store suggestions alongside the pending permission entry in both paths so they are available when the user makes a decision.

#### Scenario: Stream path stores suggestions
- **WHEN** a permission_request event with suggestions arrives
- **THEN** `PendingStreamPermission` SHALL contain the suggestions array

#### Scenario: Hook path stores suggestions
- **WHEN** a PermissionRequest with suggestions arrives
- **THEN** the pending permission resolver entry SHALL contain the suggestions array

### Requirement: Surface suggestions to renderer UI
The system SHALL pass suggestions through to the renderer via the `session:update` IPC event so the `PermissionBar` component can render them.

#### Scenario: Permission request with suggestions triggers UI update
- **WHEN** a permission request with non-empty suggestions is stored
- **THEN** the `SessionInfo` object broadcast to the renderer SHALL include the `suggestions` field

#### Scenario: Permission request without suggestions triggers UI update
- **WHEN** a permission request with empty suggestions is stored
- **THEN** the `SessionInfo` object SHALL have `suggestions` as an empty array or undefined

### Requirement: Dynamic suggestion buttons in PermissionBar
The `PermissionBar` component SHALL dynamically render suggestion buttons based on the `suggestions` array, replacing the fixed "一直允许" button.

#### Scenario: No suggestions available
- **WHEN** `suggestions` is empty or undefined
- **THEN** the PermissionBar SHALL render only two buttons: 拒绝 and 允许

#### Scenario: One addRules suggestion available
- **WHEN** `suggestions` contains one `addRules` suggestion with `ruleContent: "npm test:*"`
- **THEN** the PermissionBar SHALL render 拒绝、允许, plus a suggestion button labeled "始终允许 `npm test:*`"

#### Scenario: addRules suggestion with glob pattern
- **WHEN** `suggestions` contains one `addRules` suggestion with `ruleContent` containing `**` (e.g., `"src/**"`)
- **THEN** the suggestion button label SHALL be "允许 `{toolName}` 在 `{dir}/`" where `dir` is extracted from before `**`

#### Scenario: setMode suggestion for acceptEdits
- **WHEN** `suggestions` contains a `setMode` suggestion with `mode: "acceptEdits"`
- **THEN** the suggestion button label SHALL be "自动接受编辑"

#### Scenario: addDirectories suggestion
- **WHEN** `suggestions` contains an `addDirectories` suggestion with `directories: ["/path/to/dir"]`
- **THEN** the suggestion button label SHALL be "添加工作目录 `{dir}`"

#### Scenario: Duplicate suggestion labels are deduplicated
- **WHEN** two suggestions produce the same label text
- **THEN** only the first SHALL be rendered

### Requirement: Suggestion click constructs updatedPermissions response
When the user clicks a suggestion button, the system SHALL construct a response with `updatedPermissions` matching the suggestion's type and content.

#### Scenario: Stream path — user accepts addRules suggestion
- **WHEN** user clicks a suggestion button for an `addRules` suggestion at index N
- **THEN** the system SHALL send a `control_response` with `behavior: "allow"` and `updatedPermissions` containing the resolved suggestion with `{ type: "addRules", destination, behavior: "allow", rules: [...] }`

#### Scenario: Stream path — user accepts setMode suggestion
- **WHEN** user clicks a suggestion button for a `setMode` suggestion
- **THEN** the system SHALL send a `control_response` with `behavior: "allow"` and `updatedPermissions` containing `{ type: "setMode", mode, destination }`

#### Scenario: Hook path — user accepts suggestion
- **WHEN** user clicks a suggestion button in a hook-based session
- **THEN** the hook response SHALL include `updatedPermissions` with the resolved suggestion object

### Requirement: New IPC channels for suggestion decisions
The system SHALL provide dedicated IPC channels for suggestion-based permission resolution.

#### Scenario: Stream session suggestion IPC
- **WHEN** renderer calls `stream.suggestion(sessionId, index)` via preload
- **THEN** the main process SHALL resolve the pending permission with `updatedPermissions` constructed from the suggestion at the given index

#### Scenario: Hook session suggestion IPC
- **WHEN** renderer calls `session.suggestion(sessionId, index)` via preload
- **THEN** the main process SHALL resolve the pending permission with `updatedPermissions` constructed from the suggestion at the given index

### Requirement: PermissionSuggestion type definition
The system SHALL define a shared `PermissionSuggestion` type supporting all Claude Code suggestion types.

#### Scenario: addRules suggestion type
- **WHEN** Claude Code sends an `addRules` suggestion
- **THEN** it SHALL conform to `{ type: "addRules", destination: string, behavior: string, rules: Array<{toolName: string, ruleContent: string}> }`

#### Scenario: setMode suggestion type
- **WHEN** Claude Code sends a `setMode` suggestion
- **THEN** it SHALL conform to `{ type: "setMode", mode: string, destination: string }`

#### Scenario: addDirectories suggestion type
- **WHEN** Claude Code sends an `addDirectories` suggestion
- **THEN** it SHALL conform to `{ type: "addDirectories", directories: string[], destination: string }`

### Requirement: Rename "一直允许" to "始终允许"
The existing "一直允许" button text SHALL be renamed to "始终允许". Note: this button is removed when suggestions are present (replaced by dynamic suggestion buttons), but the text change applies if it appears in any fallback context.

#### Scenario: Button text update
- **WHEN** the always-allow button is rendered in any context
- **THEN** its label SHALL read "始终允许" instead of "一直允许"
