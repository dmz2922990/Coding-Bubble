## Overview

设置页面改造为标签页布局，新增"通知"标签页，用户可配置 4 种通知类型的自动关闭时间。配置通过已有的 config.json 持久化，SessionStore 读取配置替代硬编码值。

## UI Design

### Settings 标签页布局

```
┌─────────────────────────────────┐
│  设置                        ×  │  ← 标题栏（已有）
├──────────┬──────────────────────┤
│ 远程设备 │ 通知                 │  ← 标签栏
├──────────┴──────────────────────┤
│                                 │
│  (当前标签页内容)                │
│                                 │
└─────────────────────────────────┘
```

- 标签栏水平排列在 body 顶部
- 当前激活标签高亮，点击切换
- "远程设备"标签内容不变
- 窗口高度适当增大以容纳新内容

### 通知配置标签页内容

```
┌─────────────────────────────────┐
│  通知气泡设置                    │
│                                 │
│  🔐 请求授权 (approval)          │
│  ┌─────────────────────────┐    │
│  │ ○ 永不关闭              │    │
│  │ ○ 自定义  [====] 15s    │    │
│  │          5s ──────── 3600s   │
│  └─────────────────────────┘    │
│                                 │
│  ❌ 执行出错 (error)             │
│  ┌─────────────────────────┐    │
│  │ ○ 永不关闭              │    │
│  │ ● 自定义  [====] 8s     │    │
│  │          5s ──────── 3600s   │
│  └─────────────────────────┘    │
│                                 │
│  💬 等待输入 (input)             │
│  ┌─────────────────────────┐    │
│  │ ○ 永不关闭              │    │
│  │ ● 自定义  [====] 15s    │    │
│  │          5s ──────── 3600s   │
│  └─────────────────────────┘    │
│                                 │
│  ✅ 任务完成 (done)              │
│  ┌─────────────────────────┐    │
│  │ ○ 永不关闭              │    │
│  │ ● 自定义  [====] 4s     │    │
│  │          5s ──────── 3600s   │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

每种通知类型：
- 单选：永不关闭 / 自定义时间
- 自定义模式：滑块 + 数字输入，范围 5~3600 秒
- 默认值：approval=永不, error=8s, input=15s, done=4s

## Data Model

### Config 结构

config.json 新增 `notificationAutoClose` 字段：

```typescript
interface NotificationAutoCloseConfig {
  approval: number  // 0 = never, 5~3600 = seconds
  error: number
  input: number
  done: number
}
```

默认值（与当前硬编码一致）：
```json
{
  "notificationAutoClose": {
    "approval": 0,
    "error": 8,
    "input": 15,
    "done": 4
  }
}
```

## Data Flow

```
用户在 UI 修改 → config:set IPC → main 写入 config.json
                                        ↓
SessionStore._updateNotifications() 读取 config（通过构造时注入或 IPC 获取）
                                        ↓
设置 BubbleNotification.autoCloseMs = config[type] * 1000 (0 保持为 0)
                                        ↓
NotificationBubble 按现有逻辑使用 autoCloseMs 计时
```

### 关键设计决策

1. **配置单位**：config.json 存储秒数（整数），传给 BubbleNotification 时转为毫秒。UI 显示秒。
2. **配置传递**：main 进程启动时从 config.json 读取，通过方法传入 SessionStore。SessionStore 内部不直接读文件。
3. **运行时更新**：用户在设置中修改后，main 进程调用 `sessionStore.updateNotificationConfig(config)` 实时生效，无需重启。
4. **向后兼容**：config.json 无此字段时使用默认值。

## Implementation Plan

1. SettingsPanel 改造为标签页布局
2. 新增 NotificationSettings 组件
3. SessionStore 添加 `updateNotificationConfig()` 方法
4. main 进程启动时读取配置并注入 SessionStore
5. IPC 配置变更时实时更新
