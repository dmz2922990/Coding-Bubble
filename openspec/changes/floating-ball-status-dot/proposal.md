## Why

主窗口关闭时，用户只能看到悬浮球，无法获知 Claude Code 会话的当前状态（是在思考、执行工具、等待授权还是出错了）。需要一个状态指示器汇总所有 session 状态，让用户一眼了解全局。

## What Changes

- 在悬浮球右下角新增状态圆点（~8px），颜色反映所有 session 中最高优先级的状态
- 仅在主面板关闭时显示，面板打开时隐藏
- idle 状态或无活跃会话时不显示圆点
- 主进程通过 IPC 将 `resolveDisplayState()` 结果发送给 ball 窗口
- 状态圆点与现有 badge（右上角红色圆点，用于 pending approval 提醒）不冲突

## Capabilities

### New Capabilities
- `floating-ball-status-dot`: 悬浮球状态圆点 — 通过彩色圆点显示所有 session 的最高优先级状态

### Modified Capabilities

（无）

## Impact

- `apps/desktop/src/main/index.ts`: bubbleControllerSync 扩展，发送 displayState 给 ball 窗口
- `apps/desktop/src/renderer/components/FloatingBall/index.tsx`: 接收并渲染状态圆点
- `apps/desktop/src/renderer/components/FloatingBall/styles.css`: 状态圆点样式 + 各颜色 + 动画
- `apps/desktop/src/preload/index.ts`: 可能需要新增 IPC 通道（或复用现有 bubble:show/hide）
