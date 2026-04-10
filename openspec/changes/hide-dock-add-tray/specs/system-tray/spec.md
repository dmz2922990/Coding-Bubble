## ADDED Requirements

### Requirement: Dock icon hidden on macOS
The application SHALL hide its icon from the macOS Dock and Cmd+Tab application switcher by configuring `LSUIElement` as `true` in the application's Info.plist via electron-builder's `mac.extendInfo` setting.

#### Scenario: App launches without Dock icon
- **WHEN** the application starts on macOS
- **THEN** the Dock does not show an icon for Coding-bubble
- **AND** the application does not appear in the Cmd+Tab switcher

#### Scenario: App still visible in Activity Monitor
- **WHEN** the application is running with LSUIElement enabled
- **THEN** the process is still visible and manageable in Activity Monitor

### Requirement: System tray icon displayed
The application SHALL display a system tray (menu bar) icon on supported platforms using Electron's `Tray` module. On macOS, the icon SHALL use the Template naming convention for automatic light/dark mode adaptation.

#### Scenario: Tray icon appears on app launch
- **WHEN** the application starts and becomes ready
- **THEN** a tray icon is visible in the system tray (macOS menu bar / Windows system tray)

#### Scenario: Tray icon adapts to macOS appearance
- **WHEN** the user switches between light and dark mode on macOS
- **THEN** the tray icon automatically adjusts its appearance via macOS Template icon support

### Requirement: Tray context menu provides application controls
The tray icon SHALL display a context menu when clicked (macOS) or right-clicked (Windows/Linux) with the following items: "打开面板", "设置", a separator, and "退出".

#### Scenario: User opens panel from tray
- **WHEN** user clicks the tray context menu item "打开面板"
- **THEN** the chat panel window is created and shown
- **AND** if the panel is already open, it receives focus

#### Scenario: User opens settings from tray
- **WHEN** user clicks the tray context menu item "设置"
- **THEN** the settings window is created and shown
- **AND** if settings is already open, it receives focus

#### Scenario: User quits from tray
- **WHEN** user clicks the tray context menu item "退出"
- **THEN** the application quits completely

### Requirement: Tray menu shared with floating ball context menu
The tray context menu SHALL use the same menu structure as the floating ball's right-click context menu, maintained through a shared menu builder function.

#### Scenario: Menu items stay consistent
- **WHEN** the floating ball right-click menu or tray menu is shown
- **THEN** both menus display the same items in the same order

### Requirement: Tray instance preserved from garbage collection
The Tray instance SHALL be stored in a module-level variable to prevent JavaScript garbage collection from destroying it during the application lifecycle.

#### Scenario: Tray persists throughout app session
- **WHEN** the application is running for an extended period
- **THEN** the tray icon remains visible and functional
