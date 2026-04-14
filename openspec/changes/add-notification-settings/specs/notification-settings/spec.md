# notification-settings

## Requirements

### REQ-001: Settings Tab Layout
SettingsPanel 使用标签页布局，顶部有标签栏，包含"远程设备"和"通知"两个标签。
- 标签栏水平排列，当前激活标签有视觉高亮
- 点击标签切换内容区域
- 现有"远程设备"内容完整迁移到第一个标签页

### REQ-002: Notification Auto-Close Configuration UI
"通知"标签页展示 4 种通知类型（approval/error/input/done）的自动关闭配置。
- 每种类型显示：图标 + 类型名称 + 类型描述
- 每种类型支持两种模式：永不关闭 / 自定义秒数
- 自定义模式下提供滑块，范围 5~3600 秒，步进 1
- 同时提供数字输入框可直接输入精确值
- 输入值超出范围时自动 clamp 到 5~3600

### REQ-003: Configuration Persistence
通知配置持久化到 config.json 的 `notificationAutoClose` 字段。
- 字段结构：`{ approval: number, error: number, input: number, done: number }`
- 值为 0 表示永不关闭，5~3600 表示秒数
- config.json 无此字段时使用默认值：`{ approval: 0, error: 8, input: 15, done: 4 }`
- 用户修改后通过 `config:set` IPC 立即保存

### REQ-004: Runtime Effect
配置修改后立即生效，无需重启应用。
- main 进程调用 `SessionStore.updateNotificationConfig(config)` 更新运行时配置
- SessionStore._updateNotifications() 使用配置值替代硬编码值
- 值的单位转换：config 存秒 → autoCloseMs 用毫秒（乘以 1000），0 保持为 0

### REQ-005: Window Size
设置窗口高度适当增大以容纳通知配置内容。
