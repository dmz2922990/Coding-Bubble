## Why

悬浮球通知气泡的自动关闭时间当前硬编码在 SessionStore 中（done=4s, error=8s, input=15s, approval=永不），用户无法根据工作习惯调整。不同场景下用户可能希望错误通知停留更久以便排查，或希望完成通知更快消失减少干扰。同时设置页面目前只有"远程设备"一个区块，缺少可扩展的标签页结构。

## What Changes

- 设置页面改造为标签页布局，现有"远程设备"内容移入第一个标签页
- 新增"通知"标签页，展示 4 种通知类型（approval/input/done/error）的自动关闭时间配置
- 每种类型支持范围 5s~3600s 或"永不关闭"，通过滑块或输入框调整
- 配置持久化到 config.json，SessionStore 读取配置替代硬编码值
- NotificationBubble 的自动关闭计时器使用配置中的值

## Capabilities

### New Capabilities
- `notification-settings`: 通知气泡自动关闭时间的可配置化，包含 UI 配置界面、配置持久化、运行时生效

### Modified Capabilities

## Impact

- `apps/desktop/src/renderer/components/SettingsPanel/` — UI 改造为标签页布局
- `packages/session-monitor/src/session-store.ts` — `_updateNotifications()` 中的 autoCloseMs 改为从配置读取
- `apps/desktop/src/renderer/components/FloatingBall/NotificationBubble.tsx` — 自动关闭逻辑已支持 autoCloseMs 字段，无需改动
- `apps/desktop/src/main/index.ts` — 无需改动（config:get/set 已有）
- `apps/desktop/src/preload/index.ts` — 无需改动（config:get/set 已暴露）
