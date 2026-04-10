# 悬浮球状态圆点（Status Dot）

## 状态一览

| 状态 | 颜色 | 色值 | 出现时机 | 动画 |
|------|------|------|----------|------|
| `thinking` | 🟣 紫色 | `#ab47bc` | AI 正在思考（生成回复中） | 无 |
| `processing` | 🟢 绿色 | `#4caf50` | AI 正在执行工具（Bash/Edit/Read 等） | 无 |
| `done` | 🟢 浅绿 | `#66bb6a` | AI 完成一轮回复（3s 后自动消失） | 无 |
| `error` | 🔴 红色 | `#f44336` | 会话出错 | 闪烁 |
| `waitingForApproval` | 🟠 橙色 | `#ff9800` | 等待用户审批权限（工具执行前） | 脉冲放大 |
| `waitingForInput` | 🔘 蓝灰 | `#78909c` | AI 等待用户回答问题（AskUserQuestion） | 无 |
| `compacting` | 🔵 蓝色 | `#2196f3` | 会话上下文压缩中 | 无 |

## 显示规则

1. **面板打开时不显示** — 主进程判断 `panelVisible` 时不发送状态
2. **idle / ended 不显示** — 被过滤掉，圆点隐藏
3. **多会话取最高优先级** — 按优先级排序：

| 优先级 | 状态 |
|--------|------|
| 8 | `error` |
| 7 | `waitingForApproval` |
| 6 | `done` |
| 5 | `waitingForInput` |
| 4 | `compacting` |
| 3 | `processing` |
| 2 | `thinking` |
| 1 | `idle` |
| 0 | `ended` |

## 与 Badge（红点）的关系

圆点和 Badge 位置重叠（都在右上角）：

- **Badge**：审批等待通知红点（10px，`#ff3b30`，脉冲动画）
- **Status Dot**：会话状态指示器（8px，颜色随状态变化）

当有 pending approval 时，Badge 和 `waitingForApproval` 圆点会同时存在。

## 相关代码

- 状态定义：`packages/session-monitor/src/types.ts` — `SessionPhaseType`、`STATE_PRIORITY`
- 状态解析：`packages/session-monitor/src/session-store.ts` — `resolveDisplayState()`
- 主进程分发：`apps/desktop/src/main/index.ts` — `bubbleControllerSync()`
- 渲染展示：`apps/desktop/src/renderer/components/FloatingBall/index.tsx` — `displayState`
- 样式定义：`apps/desktop/src/renderer/components/FloatingBall/styles.css` — `.ball__status-dot--*`
