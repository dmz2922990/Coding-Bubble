# Tasks

## Phase 1: Data Layer

- [x] **T1**: Add `updateNotificationConfig()` and `_notificationConfig` to SessionStore
  - Add `_notificationConfig` field with default values `{ approval: 0, error: 8, input: 15, done: 4 }`
  - Add `updateNotificationConfig(config)` public method
  - Modify `_updateNotifications()` to use `_notificationConfig[type] * 1000` instead of hardcoded values
  - Export `NotificationAutoCloseConfig` type from session-monitor

## Phase 2: Main Process Wiring

- [x] **T2**: Load notification config at startup and wire runtime update in main/index.ts
  - Read `notificationAutoClose` from `readConfig()` on startup, call `sessionStore.updateNotificationConfig()`
  - Add `notification:update-config` IPC handler that saves config and calls `sessionStore.updateNotificationConfig()`
  - Add `notification:get-config` IPC handler to return current config to renderer

## Phase 3: Preload Bridge

- [x] **T3**: Add IPC bridge in preload for notification config
  - Add `notification.getConfig(): Promise<NotificationAutoCloseConfig>`
  - Add `notification.setConfig(config): Promise<void>`

## Phase 4: UI

- [x] **T4**: Refactor SettingsPanel to tab layout
  - Add `activeTab` state (`'remote'` | `'notification'`)
  - Render tab bar with two tabs: "远程设备" and "通知"
  - Move existing remote devices content into remote tab
  - Increase settings window height from 420 to 520

- [x] **T5**: Create NotificationSettings component
  - Load config on mount via `notification.getConfig()`
  - Render 4 notification type rows with radio + slider + number input
  - On change: update local state + call `notification.setConfig()`
  - Style to match existing settings panel aesthetic
