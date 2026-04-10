## Context

Coding-bubble 是一款基于 Electron 34 的桌面辅助工具，核心形态为浮动球 + 聊天面板。当前应用以标准 macOS 应用运行，Dock 显示图标，用户主要通过浮动球右键菜单交互。主进程代码集中在单一文件 `apps/desktop/src/main/index.ts`（817 行），窗口管理通过全局变量 `ballWin`、`panelWin`、`settingsWin` 实现。

隐藏 Dock 图标后，应用将不再出现在 Dock 栏和 Cmd+Tab 切换器中，需要系统托盘作为唯一入口。

## Goals / Non-Goals

**Goals:**
- 隐藏 macOS Dock 图标，让应用以"后台代理"形态运行
- 添加系统托盘图标和右键菜单，提供完整的应用控制入口
- 托盘菜单与现有浮动球右键菜单功能对齐（打开面板、设置、退出）
- 支持通过托盘恢复已关闭的窗口

**Non-Goals:**
- 不实现托盘图标的动态变化（如状态指示、未读计数）——未来可扩展
- 不改变 Windows/Linux 的现有行为（Windows 已设置 `skipTaskbar`）
- 不重构主进程代码结构（单文件模式保持不变）

## Decisions

### D1: 通过 electron-builder 配置隐藏 Dock 图标

**选择**: 在 `package.json` 的 `build.mac.extendInfo` 中添加 `LSUIElement: true`

**备选方案**:
- 运行时调用 `app.dock.hide()`：仅在应用运行时生效，且需要处理 Dock 图标闪烁问题
- 自定义 `Info.plist` 文件：维护成本高，与 electron-builder 配置重复

**理由**: `LSUIElement` 是 Apple 官方支持的后台应用模式，在 Info.plist 级别生效，比运行时 API 更可靠。通过 electron-builder 的 `extendInfo` 注入无需额外文件。

### D2: 托盘图标使用 macOS 模板图标

**选择**: 提供 `tray-iconTemplate.png`（黑色模板图标），macOS 自动适配浅色/深色菜单栏

**备选方案**:
- 使用全彩图标：不符合 macOS 状态栏设计规范，在浅色/深色模式下可能不可见
- 动态切换图标：增加复杂度，当前无必要

**理由**: macOS 状态栏图标规范要求使用模板图标（Template 后缀自动识别），系统负责反色处理。

### D3: 托盘菜单与浮动球右键菜单统一

**选择**: 提取菜单构建为共享函数 `buildAppMenu()`，浮动球和托盘共用

**备选方案**:
- 分别定义菜单：维护两份菜单逻辑，容易不一致

**理由**: 当前浮动球右键菜单已有 3 个选项（打开面板、设置、退出），托盘需要完全相同的功能。共享函数确保一致性。

### D4: 托盘实例在 app.whenReady 中创建

**选择**: 在 `app.whenReady()` 回调中创建 Tray 实例，与 `createBallWindow()` 并列

**备选方案**:
- 延迟到第一个窗口创建后：无必要，Tray 不依赖窗口

**理由**: Tray 是应用级资源，应在应用就绪时立即创建，确保用户始终有入口可以操作应用。

## Risks / Trade-offs

- **[LSUIElement 全局生效]** → 应用在 Cmd+Tab 中不可见，用户只能通过托盘切换回应用。Mitigation: 托盘菜单提供"打开面板"选项，且浮动球始终可见。
- **[托盘图标尺寸]** → macOS 状态栏图标建议 16x16 @1x / 32x32 @2x，需确保图标资源正确。Mitigation: 使用 22x22px 模板图标（Apple 推荐）。
- **[Tray 实例生命周期]** → Electron Tray 需要保持引用否则会被 GC 回收。Mitigation: 使用全局变量 `let tray: Tray | null = null` 保持引用。
