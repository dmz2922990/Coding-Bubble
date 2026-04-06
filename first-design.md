好的，我已经通读了关键代码。现在有了完整的理解，让我整理目标架构。

```
目标架构：Coding-bubble → Claude Session 监控器

┌──────────────────────────────────────────────────────┐
│                    Electron 主进程                     │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Socket Server (Unix socket /tmp/... )          │  │
│  │  • 接收 hook 事件                                │  │
│  │  • 权限审批：保持连接，等用户 decide              │  │
│  │  • 回复 {"decision":"allow"/"deny"}              │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────▼─────────────────────────┐  │
│  │  SessionStore (Zustand)                         │  │
│  │  • 多 session 管理                               │  │
│  │  • SessionPhase 状态机                           │  │
│  │  • Tool Tracker                                 │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────▼─────────────────────────┐  │
│  │  JSONL Parser (fs.watch + 增量解析)               │  │
│  │  • 解析 ~/.claude/projects/ 下的 JSONL           │  │
│  │  • 提取 ChatHistory                             │  │
│  │  • Tool 结果结构化                               │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────▼─────────────────────────┐  │
│  │  Hook Installer                                 │  │
│  │  • 写入 Python hook 到 ~/.claude/hooks/         │  │
│  │  • 注册 hook 到 ~/.claude/settings.json          │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                         │ IPC
                         ▼
┌──────────────────────────────────────────────────────┐
│                    React 渲染进程 (已有)                │
│                                                      │
│  FloatingBall ● ──点击──▶ ChatPanel                  │
│                             │                        │
│              ┌──────────────┼──────────────┐         │
│              │  Tab: Session A │ Session B  │         │
│              │              ChatView        │         │
│              │  • 用户消息                   │         │
│              │  • Assistant 消息            │         │
│              │  • Tool Calls (可展开)       │         │
│              │  • Thinking Blocks           │         │
│              │  • 权限审批面板               │         │
│              └──────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

### 需要清理的部分（只监控 Claude CLI）

| 现有模块 | 动作 |
|---|---|
| `packages/backend/` (Fastify, agent loop, skills) | **删除** — 不再自带 LLM 后端 |
| `packages/shared/` (WS protocol types) | **删除或重构** — 改为 session 监控的共享类型 |
| `apps/desktop/src/main/index.ts` (启动后端) | **改写** — 改为启动 Socket Server + Hook Installer |
| `useClawSocket` hook | **重写** — 从 WS chat 改为接收 session 状态流 |
| emotion, memory, greeting services | **删除** |

### 核心新增模块

| 模块 | 职责 | 复杂度 |
|---|---|---|
| `packages/session-monitor/` | 后端 socket server + session store + JSONL parser | 高 |
| Hook Python 脚本 | 复用 Claude Island 的 `claude-island-state.py`，改 socket path | 低 |
| Hook Installer | 主进程启动时自动安装/更新 hook | 中 |
| Session Tab 管理 | ChatPanel 根据活跃 session 动态创建/删除 tab | 中 |
| ChatView (Session) | 渲染 JSONL 解析的完整聊天历史（user/assistant/tool/thinking）| 高 |
| Permission Approval UI | Tool 等待审批时内嵌 approve/deny 按钮 | 中 |
| 权限审批 IPC | 渲染进程 approve/deny → 主进程 → socket 回复 hook | 中 |
| Tool Result 渲染器 | Bash 输出、文件操作等结构化结果的精美展示 | 中 |

---

主公，现在我对全貌有了清晰的认知。你觉得下一步怎么做？

1. **创建 OpenSpec change** — 写 proposal + design + spec + tasks，然后开始实现
2. **先定 UI 细节** — 具体 session tab 长什么样、权限审批面板怎么布局
3. **直接开始干** — 跳过文档，从 Hook Installer + Socket Server 开始写
