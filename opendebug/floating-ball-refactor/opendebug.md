<!-- STATE: done -->
<!-- BRANCH: main -->
<!-- TEMP_BRANCH: refactor/floating-ball-simplify -->
# Code Insight: 悬浮球功能裁剪与双击改造

## 问题描述
需要对 Coding-bubble 项目进行裁剪，保留悬浮球功能，并将双击交互改为弹出面板。

## 调查状态
- [x] 代码分析
- [x] 根因定位
- [x] 修复方案设计
- [x] 修复实施

## 分析记录

### 代码分析报告

#### 1. 问题现象
需要裁剪项目，仅保留悬浮球功能，并将双击行为从当前实现改为弹出面板。

#### 2. 代码流程分析

##### 2.1 项目架构

```
Coding-bubble/
├── apps/desktop/           # Electron 主应用
│   ├── src/main/          # 主进程（窗口管理、IPC）
│   ├── src/preload/       # 预加载脚本（contextBridge）
│   └── src/renderer/      # 渲染进程（React UI）
│       ├── components/
│       │   ├── FloatingBall/    # 悬浮球组件
│       │   ├── QuickInput/      # 条形输入框（裁剪）
│       │   ├── ChatPanel/       # 对话面板
│       │   ├── ChatBubble/      # 气泡组件
│       │   ├── CalendarView/    # 日历视图（裁剪）
│       │   ├── DayDetailView/   # 日期详情（裁剪）
│       │   ├── ClawProfile/     # 人格信息（裁剪）
│       │   └── SettingsPanel/   # 设置面板
│       └── hooks/
│           ├── useClawSocket.ts # WebSocket 连接
│           └── useClawEmotion.ts # 情绪状态
└── packages/backend/       # 内嵌后端服务
    ├── gateway/           # HTTP/WebSocket 路由
    ├── agent/             # Agent Loop（ReAct 循环）
    ├── skills/            # 技能系统（文件、记忆）
    ├── memory/            # 记忆服务（按天归档）
    ├── llm/               # LLM 客户端
    └── security/          # 请求认证
```

##### 2.2 当前双击交互流程

**文件位置**: `apps/desktop/src/renderer/components/FloatingBall/index.tsx:340-350`

```typescript
} else if (!movedRef.current) {
  if (isQiVisible) {
    // QI 展开态单击 → 收起
    toggleQuickInput()
  } else if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current)
    clickTimerRef.current = null
    toggleQuickInput()  // ← 双击展开 QuickInput
  } else {
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      handleSingleClick()  // 单击弹出气泡
    }, 250)
  }
}
```

**交互逻辑**:
- 单击：弹出随机问候气泡
- 双击：展开 QuickInput 条形输入框
- 拖拽：移动悬浮球位置
- 右键：显示上下文菜单

##### 2.3 窗口管理（主进程）

**文件位置**: `apps/desktop/src/main/index.ts`

| 窗口类型 | 尺寸 | 创建函数 | 用途 |
|---------|------|---------|------|
| ballWin | 240×340 | `createBallWindow()` | 悬浮球主窗口 |
| panelWin | 400×600 | `createPanelWindow()` | 对话面板 |
| settingsWin | 360×420 | `createSettingsWindow()` | 设置面板 |

**QuickInput 展开机制** (L233-285):
- 通过 `toggleQuickInput` IPC 动态调整 ballWin 窗口尺寸（240→420 宽度）
- 计算展开方向（左/右），避免超出屏幕边界
- 保存/恢复原始窗口位置

##### 2.4 后端服务架构

**核心服务**:

| 服务 | 文件 | 功能 | 裁剪 |
|-----|------|------|------|
| Agent Loop | `agent/loop.ts` | ReAct 对话循环 | 保留 |
| SkillManager | `agent/skill-manager.ts` | 技能激活与执行 | 保留 |
| 记忆服务 | `memory/memory-service.ts` | 按天 JSON 归档 | 保留 |
| 情绪服务 | `memory/emotion-service.ts` | idle/busy/done/night 状态机 | 保留 |
| WebSocket | `gateway/ws.ts` | 实时消息推送 | 保留 |
| 日历路由 | `gateway/calendar.ts` | 历史对话查询 | **删除** |
| 人格路由 | `gateway/persona.ts` | 人格信息查询 | **删除** |

#### 3. 问题根本原因

**N/A** - 功能裁剪和改造需求，非 bug。

#### 4. 裁剪范围确认

根据用户确认，以下内容需要裁剪：

| 功能 | 组件/文件 | 操作 |
|-----|----------|------|
| QuickInput 输入框 | `components/QuickInput/` | 删除 |
| 日历视图 | `components/ChatPanel/CalendarView.tsx` | 删除 |
| 日期详情 | `components/ChatPanel/DayDetailView.tsx` | 删除 |
| 人格信息 | `components/ClawProfile/` | 删除 |
| 回顾标签页 | ChatPanel 中的 review tab | 移除 |
| Claw 标签页 | ChatPanel 中的 profile tab | 移除 |
| 文件拖入 | FloatingBall 中的 drop handlers | 移除 |
| 日历路由 | `gateway/calendar.ts` | 删除 |
| 人格路由 | `gateway/persona.ts` | 删除 |
| QuickInput IPC | `main/index.ts:233-351` | 删除 |
| 单击气泡 | FloatingBall 单击交互 | **保留** |
| 双击打开面板动画 | 面板打开效果 | **不需要** |

#### 5. 相关代码位置

**前端组件（需修改/删除）**:
- `apps/desktop/src/renderer/components/FloatingBall/index.tsx:340-350` - 双击交互改为打开面板
- `apps/desktop/src/renderer/components/FloatingBall/index.tsx:365-429` - 删除文件拖入处理
- `apps/desktop/src/renderer/components/QuickInput/` - **删除整个目录**
- `apps/desktop/src/renderer/components/ChatPanel/index.tsx:8-9, 51, 120-123, 226-239` - 移除多标签页逻辑
- `apps/desktop/src/renderer/components/ChatPanel/CalendarView.tsx` - **删除**
- `apps/desktop/src/renderer/components/ChatPanel/DayDetailView.tsx` - **删除**
- `apps/desktop/src/renderer/components/ClawProfile/` - **删除整个目录**
- `apps/desktop/src/renderer/components/FloatingBall/styles.css:67-85` - 清理展开态样式

**主进程 IPC（需删除）**:
- `apps/desktop/src/main/index.ts:233-351` - QuickInput 相关 IPC
- `apps/desktop/src/preload/index.ts:15-20` - QuickInput IPC 暴露
- `apps/desktop/src/main/index.ts:177-223` - 文件拖入相关 IPC

**后端路由（需删除）**:
- `packages/backend/src/gateway/calendar.ts` - **删除**
- `packages/backend/src/gateway/persona.ts` - **删除**
- `packages/backend/src/index.ts:75-82` - 删除路由注册

#### 6. 缺陷分析

**N/A** - 功能性改造，无缺陷分析。

---

## 修复方案

### 修复目标

1. **保留悬浮球**：单击弹出气泡、双击打开对话面板
2. **简化 ChatPanel**：仅保留"对话"标签页，移除回顾和人格信息
3. **移除 QuickInput**：删除条形输入框及相关 IPC 逻辑
4. **移除文件拖入**：删除悬浮球文件拖入处理
5. **清理后端路由**：删除日历和人格信息路由

### 修复内容

#### 修改清单

##### 1. 前端组件修改

**FloatingBall/index.tsx**:
- 删除 QuickInput 相关 state 和引用（`qiState`, `toggleQuickInput`, `handleQuickSend`）
- 删除文件拖入事件处理器（`handleDragEnter/Over/Leave/Drop`）
- 修改双击交互：`toggleQuickInput()` → 调用 `window.electronAPI.openPanel()`
- 删除气泡方向计算逻辑（不再有展开态）
- 删除 `dropActive` state 和样式

**FloatingBall/styles.css**:
- 删除 `.ball-root--expanded` 相关样式
- 删除 `.qi-area` 样式
- 删除 `.ball--drop-active` 样式

**ChatPanel/index.tsx**:
- 删除 `PanelTab` 类型中的 `'review' | 'profile'`
- 删除 `reviewState` state
- 删除 `handleSwitchTab` 函数
- 删除标签页切换 UI（仅保留对话输入）
- 删除文件附件相关代码（`pendingFiles`, `onReceiveFiles`）
- 删除 `CalendarView` 和 `DayDetailView` 引用
- 删除 `ClawProfile` 引用

**删除文件/目录**:
```
apps/desktop/src/renderer/components/QuickInput/
apps/desktop/src/renderer/components/ChatPanel/CalendarView.tsx
apps/desktop/src/renderer/components/ChatPanel/DayDetailView.tsx
apps/desktop/src/renderer/components/ClawProfile/
```

##### 2. 主进程修改

**main/index.ts**:
- 删除 QuickInput 相关变量和 IPC：
  - `quickInputVisible`, `savedBallBounds`, `qiDirection`, `EXPANDED_W`, `BALL_EDGE_OFFSET`
  - `quickinput:toggle` handler (L240-285)
  - `quickinput:reposition` handler (L288-351)
- 删除文件拖入相关 IPC：
  - `drop:files` handler (L185-203)
  - `panel:open-with-files` handler (L208-223)
  - `panel:get-pending-files` handler (L219-223)
  - `pendingFilesForPanel` 变量
- **新增**: `panel:open` IPC handler

**preload/index.ts**:
- 删除 `toggleQuickInput` 暴露
- 删除 `repositionQuickInput` 暴露
- 删除 `resolveDroppedFiles` 暴露
- 删除 `openPanelWithFiles` 暴露
- 删除 `onReceiveFiles` 暴露
- 删除 `getPendingFiles` 暴露
- **新增**: `openPanel` 暴露

##### 3. 后端修改

**index.ts**:
- 删除 `setupCalendarRoutes` 导入和调用 (L6, L76)
- 删除 `setupPersonaRoutes` 导入和调用 (L7, L79)

**删除文件**:
```
packages/backend/src/gateway/calendar.ts
packages/backend/src/gateway/persona.ts
```

### 修复说明

#### 双击交互改造方案

**原实现**（FloatingBall/index.tsx:341-344）:
```typescript
} else if (clickTimerRef.current) {
  clearTimeout(clickTimerRef.current)
  clickTimerRef.current = null
  toggleQuickInput()  // 展开 QuickInput
}
```

**新实现**:
```typescript
} else if (clickTimerRef.current) {
  clearTimeout(clickTimerRef.current)
  clickTimerRef.current = null
  window.electronAPI.openPanel()  // 打开对话面板
}
```

同时需要在主进程中暴露 `openPanel` IPC：
```typescript
// main/index.ts
ipcMain.on('panel:open', () => {
  createPanelWindow()
})

// preload/index.ts
openPanel: (): void => { ipcRenderer.send('panel:open') }
```

#### ChatPanel 简化方案

**原结构**（3 个标签页）:
```
┌─────────────────────────┐
│ 💬对话 | 📅回顾 | 🐾Claw │
├─────────────────────────┤
│    [标签页内容区域]      │
│                         │
└─────────────────────────┘
```

**新结构**（纯对话界面）:
```
┌─────────────────────────┐
│        对话         ×   │
├─────────────────────────┤
│    [消息列表区域]        │
│                         │
├─────────────────────────┤
│    [输入框区域]          │
└─────────────────────────┘
```

### 待确认项

- [x] 回顾标签页（日历视图、历史对话）→ 移除
- [x] Claw 标签页（人格信息展示）→ 移除
- [x] 文件拖入功能 → 移除
- [x] 单击气泡功能 → 保留
- [x] 双击打开面板动画 → 不需要

---

## Change log

### 2024-04-06

#### 前端组件修改
- **FloatingBall/index.tsx**:
  - 删除 QuickInput 相关 state 和引用
  - 删除文件拖入事件处理器
  - 双击交互改为调用 `window.electronAPI.openPanel()`
  - 简化气泡方向计算（固定为 center）
- **FloatingBall/styles.css**:
  - 删除展开态样式（`.ball-root--expanded`, `.qi-area`）
  - 删除文件拖入高亮样式（`.ball--drop-active`）
- **ChatPanel/index.tsx**:
  - 删除多标签页逻辑（仅保留对话界面）
  - 删除文件附件相关代码
- **删除组件**: QuickInput/, CalendarView.tsx, DayDetailView.tsx, ClawProfile/

#### 主进程修改
- **main/index.ts**:
  - 删除 QuickInput 相关 IPC（约 120 行）
  - 删除文件拖入相关 IPC（约 50 行）
  - 新增 `panel:open` IPC handler
- **preload/index.ts**:
  - 删除 QuickInput 和文件拖入相关 API 暴露
  - 新增 `openPanel` API 暴露

#### 后端修改
- **index.ts**: 删除日历和人格路由注册
- **删除路由**: calendar.ts, persona.ts

#### 改动统计
- 15 个文件修改
- 删除 1355 行代码
- 新增 73 行代码
- 净减少 1282 行
