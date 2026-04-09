## Context

Coding-bubble 是一个 Electron + React 桌面应用，通过 Claude Code hooks 监控会话状态。当前状态机仅 6 种状态（idle/processing/waitingForInput/waitingForApproval/compacting/ended），缺少错误反馈、任务完成反馈和思考阶段区分。悬浮球在主窗口未打开时通过气泡通知用户干预（权限请求/等待输入），但无法通知任务完成或错误。

**当前架构关键路径：**
```
Claude Code → Python Hook → Unix Socket → Main Process → SessionStore
  → broadcastToRenderer → ChatPanel (主窗口状态展示)
  → bubbleControllerSync → FloatingBall (气泡通知)
```

**约束：**
- Python Hook 脚本已透传所有事件（包括未监听的），只需在 TS 层处理
- 悬浮球情绪层 CSS 已就绪但本次不激活
- 主窗口未打开时，气泡是唯一通知渠道

## Goals / Non-Goals

**Goals:**
- 补全状态机：新增 `thinking`、`done`、`error` 三种状态
- 扩展 Hook 事件监听：`PostToolUseFailure`、`StopFailure`、`SubagentStart`、`PostCompact`
- 实现 ONESHOT 自动回退机制（done/error 短暂展示后自动恢复）
- 实现状态优先级仲裁（多会话取最高优先级）
- 扩展气泡通知系统覆盖任务完成和错误通知
- 统一 ChatPanel 和 FloatingBall 的状态颜色/标签映射

**Non-Goals:**
- 悬浮球情绪层（data-emotion）激活 — 后续迭代
- 睡眠/空闲计时器序列 — 不实现
- 音效系统 — 不实现
- DND 免打扰模式 — 不实现
- SubagentStart 区分子类型（juggling/conducting）— 不实现

## Decisions

### D1: thinking 与 processing 分离

**选择：** `UserPromptSubmit` → `thinking`，`PreToolUse` → `processing`

**替代方案：** 保持统一的 `processing`，通过子字段区分

**理由：** 思考和工具执行在 UI 上有明确的视觉差异需求（紫色 vs 绿色），且 Clawd 已验证这种分离的实用性。独立状态比子字段更简单清晰。

### D2: ONESHOT 回退机制

**选择：** 在 SessionStore 内部用 setTimeout 实现，回退时检查当前状态是否仍是 ONESHOT 状态（避免覆盖新事件）

**替代方案：** 在 UI 层用 useEffect 计时器实现

**理由：** 状态回退是状态机行为，应在数据层处理。UI 层只需响应状态变化。setTimeout 回调中校验当前状态可避免竞态问题。

### D3: 气泡通知统一模型

**选择：** 扩展现有 `Intervention` 为统一的 `BubbleNotification`，增加 `type` 字段区分 approval/input/done/error

**替代方案：** 维护两套独立系统（interventions + transient notifications）

**理由：** 气泡展示层是同一个组件，统一数据模型避免组件内多数据源合并的复杂度。通过 `autoCloseMs` 字段控制自动关闭行为（0 = 永不关闭），替代现有的条件判断逻辑。

### D4: 气泡通知的触发时机

**选择：** 仅在状态机转换时触发通知，由 SessionStore 通过回调通知主进程

**理由：** 状态转换是唯一的真相源，避免在多处重复触发逻辑。主进程的 `bubbleControllerSync` 已有面板可见性判断，只需扩展数据源。

### D5: Stop 事件不再直接转 waitingForInput

**选择：** `Stop` → `done`（ONESHOT 3s 后回退 `idle`），不再转 `waitingForInput`

**替代方案：** `Stop` → `done`，ONESHOT 后回退 `waitingForInput`

**理由：** Stop 表示任务完成，完成后用户可能继续也可能不继续。回退到 `idle` 更准确 — 用户发下一个 prompt 时自然进入 `thinking`。`waitingForInput` 语义上是"Agent 主动等待用户回应"（如 AskUserQuestion），不适合用于任务结束。

### D6: SubagentStop 不再触发状态转换

**选择：** `SubagentStop` 保持当前状态不变

**理由：** 子 agent 停止不等于父会话需要用户输入。父会话可能继续执行其他工具。之前映射为 `waitingForInput` 是不准确的。

## Risks / Trade-offs

**[状态转换矩阵变复杂]** → 新增 3 个状态后转换路径增多，非法转换风险上升。**缓解：** 保持现有的 `VALID_TRANSITIONS` 校验 + `_invalidTransitions` 日志记录。

**[ONESHOT 回退与事件竞态]** → done 回退倒计时期间用户可能发新 prompt。**缓解：** 回调中校验 `session.phase.type === 'done'`，非 done 状态时跳过回退。新事件会自然将状态推到 thinking/processing。

**[SubagentStop 行为变更]** → 之前转 waitingForInput，现在不转换。依赖此行为的逻辑可能受影响。**缓解：** 检查主进程和 UI 层是否有依赖 SubagentStop → waitingForInput 的逻辑。

**[气泡通知频率]** → done/error 通知可能在频繁操作时打扰用户。**缓解：** done 仅展示 4s，error 展示 8s，都是短暂提示。未来可加冷却期。

**[BREAKING: SessionPhaseType 扩展]** → 所有消费 SessionPhaseType 的代码需适配新值。**缓解：** 影响范围明确且可控（3 个 UI 组件 + 主进程），逐一更新即可。
