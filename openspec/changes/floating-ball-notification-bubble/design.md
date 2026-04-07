## Context

当前 Bubble Desktop 应用包含三个主要窗口：悬浮球窗口、对话面板窗口和设置窗口。悬浮球作为常驻 UI 元素始终可见，而对话面板可以关闭。

当用户与 Claude Code 交互时，session 会经历不同的阶段（idle → processing → waitingForApproval/waitingForInput → ...）。当前问题在于：当对话面板关闭时，用户无法及时感知需要人工介入的会话状态变化。

## Goals / Non-Goals

**Goals:**
- 当有需要人工介入的 session 且主面板关闭时，悬浮球显示通知气泡
- 气泡显示所有待处理 session 的摘要信息（项目名称、状态）
- 点击气泡行打开主面板并跳转到对应 session tab
- 气泡随状态变化自动显示/隐藏

**Non-Goals:**
- 不替代现有的桌面通知系统
- 不支持自定义气泡样式（颜色、大小固定）
- 不处理 session 的具体内容展示（仅显示摘要）

## Decisions

### 1. 干预检测位置：SessionStore 扩展 vs 独立模块

**Decision**: 扩展 SessionStore 添加 `getPendingInterventions()` 方法

**Rationale**:
- SessionStore 已经监听所有 session 状态变化
- 避免重复的状态监听逻辑
- 统一的 state management 减少不一致风险

**Alternatives considered**:
- 独立 IntervenionDetector 模块：会增加 IPC 通信复杂度
- 在悬浮球 renderer 中检测：需要 session 数据同步，延迟高

### 2. 气泡显示逻辑：Main Process 控制 vs Renderer 自主

**Decision**: Main Process 监听 panel 可见性和 intervention 状态，主动通知悬浮球显示/隐藏

**Rationale**:
- Main Process 是唯一的真相来源（知道 panel 是否可见）
- 避免悬浮球频繁轮询
- 统一控制逻辑便于调试

**Implementation**:
```typescript
// Main process monitors both conditions
if (!panelWin?.isVisible() && pendingInterventions.length > 0) {
  ballWin?.webContents.send('bubble:show', pendingInterventions)
}
```

### 3. 气泡 UI 实现：独立窗口 vs 悬浮球内嵌

**Decision**: 悬浮球内嵌 React 组件，通过条件渲染显示

**Rationale**:
- 避免多窗口管理的复杂度（z-index、焦点问题）
- 可以利用现有的 React 生态和样式系统
- 与悬浮球的生命周期绑定，简化管理

**Trade-off**: 气泡大小受悬浮球窗口尺寸限制（当前 240x340）

### 4. 点击导航：直接 IPC vs 通过 Main Process 中转

**Decision**: 悬浮球 renderer → Main Process → Panel Renderer

**Rationale**:
- Main Process 负责窗口管理（确保 panel 打开、获得焦点）
- 符合 Electron 安全最佳实践（不直接从 renderer A 控制 renderer B）

**IPC Flow**:
```
Bubble Renderer --(panel:navigate-to-session)--> Main Process --(navigate-to-tab)--> Panel Renderer
```

### 5. 状态颜色编码

| 状态 | 颜色 | 说明 |
|------|------|------|
| waitingForApproval | #ff9800 (orange) | 需要权限审批 |
| waitingForInput | #2196f3 (blue) | 需要用户输入 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Process                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SessionStore Extension                             │   │
│  │  - getPendingInterventions(): Intervention[]        │   │
│  │  - onInterventionChange(callback)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BubbleController                                   │   │
│  │  - Monitor panel visibility                         │   │
│  │  - Monitor intervention list                        │   │
│  │  - Send show/hide commands to ball window           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌─────────────────────┐              ┌─────────────────────┐
│   Floating Ball     │              │   Panel Window      │
│   Renderer          │              │   Renderer          │
│                     │              │                     │
│  ┌───────────────┐  │              │  ┌───────────────┐  │
│  │ Notification  │  │  IPC:navigate│  │  ChatPanel    │  │
│  │ Bubble        │  │ ─────────────►  │  - TabManager │  │
│  │ - Row list    │  │              │  │  - activateTab│  │
│  │ - Click       │  │              │  └───────────────┘  │
│  │   handlers    │  │              │                     │
│  └───────────────┘  │              └─────────────────────┘
└─────────────────────┘
```

## Data Flow

### Intervention List Flow
```
HookEvent (Stop, PermissionRequest) → SessionStore.process()
                                           ↓
                                  phase transition detected
                                           ↓
                              getPendingInterventions() updated
                                           ↓
                              Main Process broadcasts to ball
                                           ↓
                              Floating Ball updates bubble UI
```

### Navigation Flow
```
User clicks bubble row
        ↓
IPC: 'panel:navigate-to-session' (bubble → main)
        ↓
Main: ensurePanelVisible()
        ↓
Main → Panel: IPC 'navigate-to-tab', sessionId
        ↓
Panel: TabManager.setActiveTabId(sessionId)
        ↓
Main: hideBubble()
```

## Implementation Details

### Types
```typescript
interface Intervention {
  sessionId: string
  projectName: string
  phase: 'waitingForApproval' | 'waitingForInput'
  toolName?: string
}

interface BubbleState {
  visible: boolean
  interventions: Intervention[]
}
```

### IPC Channels (New)
- `bubble:show` - Main → Ball: 显示气泡并传入干预列表
- `bubble:hide` - Main → Ball: 隐藏气泡
- `panel:navigate-to-session` - Ball → Main: 请求导航到 session
- `navigate-to-tab` - Main → Panel: 激活指定 tab

### File Structure
```
apps/desktop/src/
├── main/
│   └── index.ts              # 添加 BubbleController 逻辑
├── preload/
│   └── index.ts              # 添加新 IPC 通道暴露
└── renderer/
    ├── components/
    │   ├── FloatingBall/
    │   │   └── NotificationBubble.tsx   # 新组件
    │   └── ChatPanel/
    │       └── index.tsx       # 添加 navigate-to-tab 处理
    └── hooks/
        └── useInterventions.ts  # 自定义 hook
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| [Risk] 气泡遮挡悬浮球拖拽 | 气泡使用独立渲染层，不影响 mouse events；点击气泡区域关闭穿透 |
| [Risk] 多屏幕环境下气泡位置异常 | 获取悬浮球屏幕 bounds，计算气泡位置时考虑 workArea |
| [Risk] 频繁状态变化导致 UI 闪烁 | 使用 React state batching，debounce 快速连续更新 |
| [Risk] SessionStore 与 UI 状态不一致 | 每次气泡显示前重新查询 intervention 列表 |

## Migration Plan

无数据迁移需求，纯 UI 功能新增。

部署步骤：
1. 更新 session-monitor 包（SessionStore 扩展）
2. 更新悬浮球组件（NotificationBubble）
3. 更新主进程逻辑（BubbleController）
4. 更新 preload（新 IPC 通道）

回滚策略：恢复上一版本代码，重新打包。

## Open Questions

1. **气泡最大高度限制**: 当 intervention 超过 5 个时，是否需要滚动还是截断？
   - **建议**: 最大显示 5 行，超出显示 "+N more"

2. **气泡自动隐藏延时**: 是否需要鼠标 hover 时保持显示？
   - **建议**: 不需要，气泡始终显示直到条件不满足

3. **已读状态**: 是否需要标记用户已查看的气泡？
   - **建议**: MVP 不需要，后续可考虑添加 badge 计数
