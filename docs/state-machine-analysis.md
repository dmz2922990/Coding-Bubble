# Clawd 状态切换机制分析

## 整体架构

状态切换由**两条路径**驱动，最终汇聚到同一个状态机 `src/state.js`：

```
路径一（Hook 驱动）:
  Agent 事件 → hook 脚本 → HTTP POST /state → server.js → updateSession() → setState()

路径二（计时器驱动）:
  tick.js 主循环(50ms) → 鼠标静止检测 → setState() / applyState()
```

---

## 路径一：Hook 驱动的状态切换

### 事件→状态映射

各 agent 的 hook 脚本负责将 Agent 事件映射为桌宠状态。以 Claude Code 为例（`hooks/clawd-hook.js` + `agents/claude-code.js`）：

| Hook 事件 | 映射状态 | 说明 |
|---|---|---|
| `SessionStart` | `idle` | 新会话开始 |
| `UserPromptSubmit` | `thinking` | 用户提交 prompt |
| `PreToolUse` | `working` | 工具调用前 |
| `PostToolUse` | `working` | 工具调用后 |
| `PostToolUseFailure` | `error` | 工具调用失败 |
| `SubagentStart` | `juggling` | 子 agent 启动 |
| `SubagentStop` | `working` | 子 agent 停止 |
| `Stop` | `attention` | 任务正常完成 |
| `StopFailure` | `error` | 任务异常完成 |
| `PreCompact` | `sweeping` | 压缩上下文前 |
| `PostCompact` | `attention` | 压缩上下文后 |
| `Notification` | `notification` | 系统通知 |
| `Elicitation` | `notification` | 用户问答 |
| `WorktreeCreate` | `carrying` | 创建 worktree |
| `SessionEnd` | `sleeping` | 会话结束（`/clear` 时映射为 `sweeping`）|

### 数据流

```
Claude Code 触发事件
  → hooks/clawd-hook.js（零依赖 Node 脚本）
    → stdin 读取 JSON（session_id, source_pid, cwd）
    → EVENT_TO_STATE[event] 映射
    → 进程树遍历获取终端 PID（getStablePid）
  → HTTP POST 127.0.0.1:23333/state
    → src/server.js 路由分发
      → src/state.js updateSession()
```

### 多 Agent 统一路径

所有 agent（Claude Code、Codex、Cursor、Copilot、Gemini、opencode）的 hook 脚本最终都通过相同的 HTTP POST `/state` 端点进入状态机，只是 `agent_id` 不同。

---

## 路径二：计时器驱动的状态切换（非 Hook）

由 `src/tick.js` 主循环（50ms 间隔）驱动，**不依赖任何 hook**：

| 触发条件 | 目标状态 | 说明 |
|---|---|---|
| 鼠标静止 20s | idle-look（随机 idle 动画） | 一次性播放后返回 idle-follow |
| 鼠标静止 60s | `yawning` | 开始睡眠序列 |
| dozing + 鼠标静止 10min | `collapsing` → `sleeping` | 深度睡眠 |
| 鼠标移动（dozing 中） | 恢复 `idle` | 轻度唤醒 |
| 鼠标移动（sleeping 中） | `waking` → 恢复 | 深度唤醒（1.5s 动画）|

### 睡眠序列链

```
idle (20s 鼠标静止)
  → idle-look (随机动画, 播放完返回)
  → (60s 鼠标静止)
  → yawning (3s)
  → dozing (10min 鼠标静止)
  → collapsing (0.8s)
  → sleeping
  → (鼠标移动) → waking (1.5s) → 恢复
```

---

## 状态机核心逻辑（state.js）

### 状态优先级

```javascript
STATE_PRIORITY = {
  error: 8, notification: 7, sweeping: 6, attention: 5,
  carrying: 4, juggling: 4, working: 3, thinking: 2, idle: 1, sleeping: 0,
};
```

### 单次性状态（ONESHOT）

以下状态显示后会自动回退到 `resolveDisplayState()` 的结果：

- `attention` — 任务完成
- `error` — 出错
- `sweeping` — 压缩上下文
- `notification` — 通知
- `carrying` — 搬运

### `setState()` — 入口门控

三个关键过滤机制：

1. **DND 过滤**：`ctx.doNotDisturb` 为 true 时丢弃所有事件
2. **最小显示时长**（`MIN_DISPLAY_MS`）：防止快速闪切
   - error: 5s, attention/notification: 4s, carrying: 3s, sweeping: 2s, working/thinking: 1s
3. **优先级排队**：新状态优先级低于已排队状态时被丢弃

### `updateSession()` — 多会话管理

Hook 事件的真正入口，核心逻辑：

1. 维护 `sessions` Map（最多 20 个会话，10 分钟过期）
2. **PermissionRequest**：直接触发 `notification`，不走会话更新
3. **SessionEnd**：删除会话 → 无活跃会话则进入 `sleeping`；`/clear` 映射为 `sweeping`
4. 其他事件：更新对应会话状态 → `resolveDisplayState()` 取最高优先级

### `resolveDisplayState()` — 多会话仲裁

遍历所有活跃会话，取**优先级最高**的状态作为显示状态。headless 会话（`-p/--print` 模式）不参与仲裁。

### `applyState()` — 最终渲染

执行顺序：

1. **Mini 模式拦截**：`notification` → `mini-alert`，`attention` → `mini-happy`，其他状态静默
2. **音效触发**：attention/mini-happy → `complete`，notification/mini-alert → `confirm`
3. **SVG 选择**：working 按活跃会话数分档（1→typing, 2→juggling, 3+→building）
4. **眼球追踪重置**：非 idle 状态归零眼球偏移
5. **HitBox 更新**：根据 SVG 尺寸切换碰撞区域
6. **IPC 通知渲染进程**：`state-change` 事件
7. **自动回退定时器**：ONESHOT 状态到期后回到 `resolveDisplayState()`

---

## Working 子动画分档

根据活跃工作会话数自动选择动画：

| 活跃会话数 | SVG 动画 | 说明 |
|---|---|---|
| 1 | typing | 单会话打字 |
| 2 | juggling | 双会话抛接 |
| 3+ | building | 多会话搭建 |

### Juggling 子分档

| 活跃 juggling 数 | SVG 动画 | 说明 |
|---|---|---|
| 1 | juggling | 单子 agent |
| 2+ | conducting | 指挥多个子 agent |

---

## 状态→动画映射总表

| 状态 | 动画 SVG | 触发来源 |
|---|---|---|
| idle | clawd-idle-follow.svg | Hook: SessionStart / ONESHOT 回退 |
| idle-look | 随机 idle 动画 | 计时器: 鼠标静止 20s |
| thinking | clawd-working-thinking.svg | Hook: UserPromptSubmit |
| working | typing/juggling/building | Hook: PreToolUse/PostToolUse |
| juggling | juggling/conducting | Hook: SubagentStart |
| attention | clawd-happy.svg | Hook: Stop/PostCompact |
| error | clawd-error.svg | Hook: PostToolUseFailure/StopFailure |
| notification | clawd-notification.svg | Hook: Notification/Elicitation/PermissionRequest |
| sweeping | clawd-working-sweeping.svg | Hook: PreCompact / SessionEnd(+/clear) |
| carrying | clawd-working-carrying.svg | Hook: WorktreeCreate |
| yawning | clawd-yawning.svg | 计时器: 鼠标静止 60s |
| dozing | clawd-dozing.svg | 计时器: yawning 3s 后 |
| collapsing | clawd-collapse-sleep.svg | 计时器: dozing 10min 后 / DND 进入 |
| sleeping | clawd-sleeping.svg | 计时器: collapsing 后 / Hook: SessionEnd |
| waking | clawd-wake.svg | 计时器: 睡眠中鼠标移动 |

---

## 特殊状态处理

### DND（免打扰）模式

- 进入：`yawning` → `collapsing` → `sleeping`（跳过 dozing）
- 所有 hook 事件被 `setState()` 入口丢弃
- 权限请求被自动 deny（Claude Code）或静默丢弃（opencode）
- 唤醒：播放 `waking` 动画后恢复

### Startup Recovery

桌宠在 agent 会话中途启动时，检测已运行的 agent 进程，抑制 idle→sleep 序列，保持 idle-follow 等待 hook 到来。

### Mini 模式

- 大部分状态被静默丢弃
- 仅 `notification` → `mini-alert`，`attention` → `mini-happy` 放行
- 独立的 mini-idle → 眼球追踪，跳过 idle-look/sleep 序列
- Hover 探头：鼠标悬停 → `mini-peek`，离开 → `mini-idle`
