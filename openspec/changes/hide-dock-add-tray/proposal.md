## Why

Coding-bubble 是一款常驻后台的辅助工具（浮动球 + 聊天面板），Dock 图标占用位置且与应用定位不符。作为后台工具，应以系统托盘为入口，隐藏 Dock 图标，提供更轻量的交互方式。

## What Changes

- 隐藏 macOS Dock 图标（通过 `LSUIElement` 配置）
- 新增系统托盘（Tray）图标及右键菜单，提供：显示/隐藏面板、设置、退出等功能
- 托盘图标需要适配 macOS 状态栏的视觉风格（模板图标）
- 窗口全部关闭时通过托盘仍可重新唤起

## Capabilities

### New Capabilities

- `system-tray`: 系统托盘图标管理，包括托盘创建、图标渲染、右键菜单、窗口唤起、应用退出

### Modified Capabilities

（无已有 specs 需要修改）

## Impact

- **主进程代码** (`apps/desktop/src/main/index.ts`)：需集成 Tray 模块，调整应用生命周期
- **资源文件**：需新增托盘图标资源（`resources/tray-iconTemplate.png` 等）
- **构建配置** (`apps/desktop/package.json`)：electron-builder 的 `mac.extendInfo` 需添加 `LSUIElement: true`
- **平台兼容**：macOS 为主，Windows/Linux 需确保不回归
