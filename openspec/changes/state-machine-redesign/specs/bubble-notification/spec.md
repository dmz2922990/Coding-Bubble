## ADDED Requirements

### Requirement: Unified bubble notification model
The system SHALL use a unified `BubbleNotification` type for all bubble notifications, replacing the current `Intervention`-only model.

```typescript
type NotificationType = 'approval' | 'input' | 'done' | 'error'

interface BubbleNotification {
  sessionId: string
  projectName: string
  type: NotificationType
  toolName?: string
  timestamp: number
  autoCloseMs: number  // 0 = never auto-close
}
```

#### Scenario: Notification created from state
- **WHEN** a session enters a notification-worthy state
- **THEN** a `BubbleNotification` SHALL be created with the correct type and autoCloseMs

### Requirement: Notification-worthy states trigger bubble display
The following state transitions SHALL trigger bubble notifications when the main panel is not visible:

| State → | Notification Type | autoCloseMs |
|---|---|---|
| `done` | `done` | 4000 |
| `error` | `error` | 8000 |
| `waitingForApproval` | `approval` | 0 (never) |
| `waitingForInput` | `input` | 15000 |

States `idle`, `thinking`, `processing`, `compacting`, `ended` SHALL NOT trigger notifications.

#### Scenario: Task completion shows notification
- **WHEN** a session transitions to `done` and the main panel is not visible
- **THEN** a bubble notification with type `done` SHALL appear and auto-close after 4 seconds

#### Scenario: Error shows notification
- **WHEN** a session transitions to `error` and the main panel is not visible
- **THEN** a bubble notification with type `error` SHALL appear and auto-close after 8 seconds

#### Scenario: Processing does not show notification
- **WHEN** a session transitions to `processing`
- **THEN** no bubble notification SHALL be triggered

### Requirement: Bubble notification priority ordering
When multiple notifications are active, they SHALL be ordered by priority: `approval` > `error` > `input` > `done`. The highest-priority notification SHALL be displayed first.

#### Scenario: Approval takes priority over done
- **WHEN** both an `approval` and a `done` notification are active
- **THEN** the `approval` notification SHALL be displayed first

### Requirement: Notification auto-close behavior
- `approval` type notifications SHALL NOT auto-close
- `error` type notifications SHALL auto-close after 8 seconds
- `input` type notifications SHALL auto-close after 15 seconds
- `done` type notifications SHALL auto-close after 4 seconds
- Auto-close timer SHALL reset when new notifications arrive

#### Scenario: Approval notification stays open
- **WHEN** an `approval` notification is displayed
- **THEN** it SHALL remain visible until the user explicitly closes it or resolves the approval

#### Scenario: Done notification auto-closes
- **WHEN** a `done` notification is displayed
- **THEN** it SHALL automatically close after 4 seconds

### Requirement: Notifications are cleared when session leaves notification-worthy state
- **WHEN** a session transitions from a notification-worthy state to a non-notification state (e.g., `waitingForApproval` → `processing`)
- **THEN** the corresponding notification SHALL be removed from the active list

#### Scenario: Approval resolved removes notification
- **WHEN** user approves a permission and session transitions from `waitingForApproval` to `processing`
- **THEN** the approval notification SHALL be removed

### Requirement: Badge indicator for pending approvals
A red badge SHALL be displayed on the floating ball when the user has manually closed the notification bubble and there are still active `approval` type notifications.

#### Scenario: Badge appears after dismiss with pending approval
- **WHEN** user closes the notification bubble while an `approval` notification exists
- **THEN** a red pulsing badge SHALL appear on the floating ball

#### Scenario: Badge disappears when all approvals resolved
- **WHEN** all `approval` notifications are resolved
- **THEN** the badge SHALL disappear

### Requirement: Bubble is hidden when main panel is visible
- **WHEN** the main panel window is visible
- **THEN** no bubble notifications SHALL be displayed on the floating ball
- **WHEN** the main panel is closed or hidden
- **THEN** active notifications SHALL be displayed

#### Scenario: Panel opened hides bubble
- **WHEN** the main panel becomes visible while a notification is active
- **THEN** the notification bubble SHALL be hidden

### Requirement: Notification bubble displays state-appropriate content
- `approval` type: SHALL show tool name and approval action buttons
- `input` type: SHALL show project name and "等待输入" label
- `done` type: SHALL show project name with completion indicator
- `error` type: SHALL show project name with error indicator

#### Scenario: Done notification content
- **WHEN** a `done` notification is displayed
- **THEN** the bubble SHALL show "✅ {projectName} 任务完成"

#### Scenario: Error notification content
- **WHEN** an `error` notification is displayed
- **THEN** the bubble SHALL show "❌ {projectName} 执行出错"
