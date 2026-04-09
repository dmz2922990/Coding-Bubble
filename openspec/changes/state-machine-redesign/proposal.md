## Why

当前 Coding-bubble 的会话状态机过于简化（仅 6 种状态），与 Claude Code hook 事件的丰富语义不匹配。具体问题：
- 缺少 `error` 状态，工具失败和任务异常无视觉反馈
- `processing` 粒度太粗，无法区分"思考中"与"执行工具"
- 任务完成后直接进入 `waitingForInput`，缺少完成反馈
- 不监听 `PostToolUseFailure`、`StopFailure`、`SubagentStart`、`PostCompact` 等关键事件
- 无状态优先级、防闪切、ONESHOT 自动回退等机制
- 悬浮球情绪层（`data-emotion`）CSS 已就绪但完全未连接

参考 Clawd 桌宠的成熟状态机设计，重新规划状态体系，使 Coding-bubble 能准确反映 Claude Code 会话的真实阶段。

## What Changes

- **新增状态**：`thinking`（用户提交 prompt 后的思考阶段）、`error`（工具失败/任务异常）、`done`（任务完成庆祝，ONESHOT 自动回退）
- **扩展 Hook 事件监听**：新增 `PostToolUseFailure`、`StopFailure`、`SubagentStart`、`PostCompact` 事件处理
- **引入状态优先级系统**：多会话仲裁时按优先级取最高状态作为显示状态
- **引入防闪切机制**：`MIN_DISPLAY_MS` 确保关键状态（error、done）至少展示指定时长
- **引入 ONESHOT 自动回退**：`done`、`error` 状态在展示后自动回退到 `resolveDisplayState()` 结果
- **激活悬浮球情绪层**：将 `data-emotion` CSS 与状态机连接，实现视觉反馈
- **统一 UI 状态映射**：颜色、标签、动画全部按新状态体系重新映射
- **BREAKING**: `SessionPhaseType` 类型扩展，所有消费方需适配新状态

## Capabilities

### New Capabilities
- `session-state-machine`: 会话状态机核心 — 状态定义、优先级、合法转换矩阵、ONESHOT 回退、防闪切
- `hook-event-mapping`: Hook 事件到状态的完整映射 — 新增事件监听与转换规则
- `floating-ball-emotion`: 悬浮球情绪层 — 将状态机与 data-emotion CSS 连接，实现视觉反馈

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **packages/session-monitor/src/types.ts**: `SessionPhaseType` 和 `SessionPhase` 类型扩展
- **packages/session-monitor/src/session-store.ts**: `VALID_TRANSITIONS` 更新、事件处理逻辑扩展、优先级/防闪切/ONESHOT 机制
- **packages/session-monitor/src/hook-installer.ts**: `HOOK_EVENTS` 列表扩展
- **packages/session-monitor/resources/claude-bubble-state.py**: Python hook 脚本需转发新事件
- **apps/desktop/src/main/index.ts**: 主进程 IPC 可能需要适配新状态
- **apps/desktop/src/renderer/components/ChatPanel/**: UI 层所有状态映射（颜色、标签、badge）需更新
- **apps/desktop/src/renderer/components/FloatingBall/**: 情绪层激活、状态驱动 `data-emotion`
- **apps/desktop/src/renderer/components/ChatPanel/types.ts**: 重复的 `SessionPhaseType` 需同步更新
