# Coding-bubble

一个轻量级的桌面 AI 伴侣，以悬浮球形式常驻屏幕。实时监控 Claude Code 会话、弹出通知、无需切换终端即可审批权限请求。支持 macOS 和 Windows。

## 架构

基于 pnpm monorepo 的多包结构：

```
coding-bubble/
├── apps/desktop/              # Electron 桌面应用
├── packages/session-monitor/  # 会话监控核心逻辑
├── packages/stream-json/      # Stream-json 协议适配器
├── packages/remote/           # 远程会话支持
├── packages/shared/           # 共享类型与工具
├── openspec/                  # 设计文档 (OpenSpec)
├── docs/                      # 分析与设计文档
└── data/                      # 运行时配置 (config.json)
```

## 支持的会话模式

Coding-bubble 支持四种会话来源模式，灵活适配不同的 Claude Code 使用方式：

| 模式 | 来源 | 指示器 | 说明 |
|------|------|--------|------|
| `hook` | 本地 Hook | 灰色圆点 ● | Claude Code 在终端中独立运行。Hook 脚本 (`claude-bubble-state.js`) 拦截会话事件，通过 Unix 域套接字转发。 |
| `stream` | 本地流式 | 浅蓝圆点 ● `#4fc3f7` | 桌面应用自行启动 Claude Code 进程，使用 `--output-format stream-json --input-format stream-json` 参数，完全控制 stdin/stdout。 |
| `remote-hook` | 远程 Hook | 灰色菱形 ◆ | 远程服务器运行 Claude Code 并安装 Hook，事件通过 WebSocket 转发到本地桌面应用。 |
| `remote-stream` | 远程流式 | 浅蓝菱形 ◆ `#4fc3f7` | 桌面应用通过 WebSocket 在远程服务器上创建 Claude Code 会话，双向事件流式传输。 |

### 权限模式

每个会话内支持以下权限模式：

| 权限模式 | 行为 |
|----------|------|
| `default` | 每次权限请求都需要用户审批（常规交互模式） |
| `auto` | 自动审批所有权限请求 |
| `bypassPermissions` | 自动审批（由 Claude Code 自身设置） |

## 远程模式

远程模式允许你从本地桌面应用监控和控制运行在**远程设备**上的 Claude Code 会话，通过 WebSocket 进行通信。

### 架构

```
远程设备 (Server)                           本地桌面 (Client)
┌─────────────────────┐                    ┌──────────────────────────┐
│ Claude Code CLI     │                    │ Electron 桌面应用        │
│   ↕ hook 脚本       │                    │   ↕ SessionStore / UI    │
│ SocketServer        │                    │   ↕ RemoteManager        │
│   ↕ HookCollector   │◄─── WebSocket ────►│   ↕ RemoteHookAdapter    │
│   ↕ StreamHandler   │   (端口 9527)      │   ↕ RemoteStreamAdapter  │
│ StreamSession       │                    └──────────────────────────┘
└─────────────────────┘
```

### 快速开始

**1. 在远程设备上启动服务器：**

```bash
# 构建服务器
pnpm --filter @coding-bubble/remote build

# 开发模式运行
npx tsx packages/remote/src/server/index.ts --port 9527 --token mysecret

# 或运行打包版本
node packages/remote/dist/coding-bubble-remote-server.js --port 9527 --token mysecret
```

| CLI 参数 | 默认值 | 说明 |
|----------|--------|------|
| `--port <端口号>` | `9527` | WebSocket 监听端口 |
| `--token <令牌>` | 无（免认证） | 认证令牌 |

**2. 配置桌面应用：**

1. 点击悬浮球打开面板
2. 进入 **设置** → **远程设备** 标签页
3. 点击 **添加服务器**，填写：
   - **名称**：自定义名称（如 "开发服务器"）
   - **主机**：远程设备的 IP 或主机名
   - **端口**：`9527`（或自定义端口）
   - **令牌**：服务器端设置的认证令牌（可选）
4. 点击 **连接**

**3. 使用远程会话：**

- **远程 Hook**：连接后，在远程设备终端启动的 Claude Code 会话会自动出现在会话列表中。你可以直接在桌面应用中审批/拒绝权限请求。
- **远程流式**：在会话列表中点击 **"+ 远程对话"**，选择已连接的服务器，浏览远程文件系统选择工作目录，然后创建会话。

### 远程 Hook 与远程流式的区别

|  | 远程 Hook | 远程流式 |
|---|---|---|
| **谁启动 Claude** | 你（在远程终端） | 桌面应用（通过 WebSocket） |
| **会话创建方式** | 自动（被动监听） | 手动通过对话框（主动创建） |
| **消息输入** | 通过远程终端 | 通过桌面应用输入框 |
| **终端跳转** | 支持 | 不适用 |
| **适用场景** | 监控已有的会话 | 在远程设备上启动新会话 |

### 自动重连

连接断开后，客户端自动以指数退避策略重连（1s → 2s → 4s → ... → 最大 30s）。

## 状态与显示逻辑

### 会话阶段状态机

每个 Claude Code 会话遵循严格的状态机，包含 10 个阶段和校验转换规则：

```
                    ┌──────────────────────────────┐
                    │            idle               │
                    └──┬───┬───┬───┬───┬───┬───┬───┘
                       │   │   │   │   │   │   │
            thinking◄──┘   │   │   │   │   │   │
               │           │   │   │   │   │   │
               ├──►processing◄──┘   │   │   │   │
               │      │             │   │   │   │
               │      ├──►juggling──┘   │   │   │
               │      │      │         │   │   │
               │      │      └──►waitingForApproval
               │      │               │  │   │
               │      └──►done◄───────┘  │   │
               │            │            │   │
               │      error◄┼────────────┘   │
               │       │    │                │
               │       └──►idle              │
               │                             │
               └──►waitingForInput◄──────────┘
                        │        ▲
                        └────────┘
                    compacting ◄──► (来自 processing/idle/waitingForInput)
                        │
                        └──► ended (终态)
```

### 阶段颜色

每个会话阶段在悬浮球状态灯、Tab 指示条、会话列表卡片和通知徽标中使用统一的颜色：

| 阶段 | 颜色 | 色值 | 动画 |
|------|------|------|------|
| `idle` | 灰色 | `#888` | — |
| `thinking` | 紫色 | `#ab47bc` | — |
| `processing` | 蓝色 | `#2196f3` | — |
| `juggling` | 紫色 | `#ab47bc` | — |
| `done` | 绿色 | `#66bb6a` | — |
| `error` | 红色 | `#f44336` | 闪烁 (1s) |
| `waitingForInput` | 蓝灰色 | `#78909c` | — |
| `waitingForApproval` | 橙色 | `#ff9800` | 脉冲 (1.5s) |
| `compacting` | 蓝色 | `#2196f3` | — |
| `ended` | 浅灰色 | `#9e9e9e` | — |

### 阶段优先级（悬浮球显示）

当多个会话同时活跃时，悬浮球显示优先级最高的阶段：

| 优先级 | 阶段 | 含义 |
|--------|------|------|
| 8 | `error` | 会话遇到错误 |
| 7 | `waitingForApproval` | 等待用户审批权限请求 |
| 6 | `done` | 会话完成当前任务 |
| 5 | `waitingForInput` | 等待用户文本输入 |
| 4 | `compacting` / `juggling` | 上下文压缩 / 子智能体运行中 |
| 3 | `processing` | 正在执行工具调用 |
| 2 | `thinking` | Claude 正在思考 |
| 1 | `idle` | 无活跃工作 |
| 0 | `ended` | 会话已终止 |

### 自动回退超时

特定阶段在无新事件到达时自动回退为 `idle`：

| 阶段 | 超时时间 |
|------|----------|
| `done` | 10 秒 |
| `thinking` | 10 分钟 |
| `processing` | 10 分钟 |
| `juggling` | 10 分钟 |

### 通知系统

四种通知类型，支持配置自动关闭时间：

| 类型 | 触发条件 | 默认自动关闭 | 颜色 |
|------|----------|-------------|------|
| `approval` | 会话进入 `waitingForApproval` | 永不关闭（需用户操作） | 橙色 `#ff9800` 🔐 |
| `input` | 会话进入 `waitingForInput` | 15 秒 | 蓝灰色 `#78909c` 💬 |
| `done` | 会话进入 `done` | 15 秒 | 绿色 `#66bb6a` ✅ |
| `error` | 会话进入 `error` | 30 秒 | 红色 `#f44336` ❌ |

通知显示在悬浮球上方独立的透明窗口中。快速审批按钮支持一键授权，无需打开对话面板。

## 终端跳转支持

终端跳转功能允许用户在会话列表中点击按钮，立即将焦点切换到运行该 Claude Code 会话的终端窗口。目前仅支持 **macOS**。

### 支持的终端

| 终端 | 检测方式 | 聚焦策略 |
|------|----------|----------|
| **Ghostty** | 进程名匹配 | AppleScript（工作目录匹配） |
| **iTerm2** | 进程名匹配 | AppleScript（TTY 会话匹配） |
| **Terminal.app** | 进程名匹配 | AppleScript（TTY 标签页匹配） |
| **Warp** | 进程名匹配 | Bundle ID 激活 |
| **kitty** | 进程名匹配 | 远程控制协议 (`kitty @ focus-window --match cwd:`) |
| **WezTerm** | 进程名匹配 | CLI 命令 (`wezterm cli activate-pane`) |
| **Alacritty** | 进程名匹配 | Bundle ID 激活 |
| **cmux** | 进程名匹配 | CLI 命令 (`cmux find-window --select`) |
| **VS Code** | 进程名匹配 | Bundle ID 激活 |
| **Cursor** | 进程名匹配 | Bundle ID 激活 |
| **Zed** | 进程名匹配 | Bundle ID 激活 |

### 检测与聚焦策略

1. **进程树追踪**：通过 `ps` 构建进程树，从 Claude Code 的 PID 向上遍历祖先进程，识别父终端
2. **终端专属激活**：针对不同终端使用最优策略（AppleScript、CLI、远程控制协议）
3. **tmux 支持**：检测到 tmux 时，使用 `tmux select-window`/`tmux select-pane` 导航到正确的窗格
4. **回退链**：Ghostty → iTerm2 → Terminal.app → Warp → kitty

## 核心模块

### apps/desktop — Electron 桌面应用

| 层级 | 路径 | 职责 |
|------|------|------|
| Main 进程 | `src/main/index.ts` | 窗口管理（悬浮球/面板/设置/通知）、IPC 通信、权限审批、系统托盘、会话桥接 |
| Renderer | `src/renderer/App.tsx` | 通过 `?view=` URL 参数路由到各视图 |
| Preload | `src/preload/index.ts` | contextBridge 安全桥接 |

**UI 组件：**

| 组件 | 路径 | 说明 |
|------|------|------|
| FloatingBall | `components/FloatingBall/` | 可拖拽悬浮球，含状态指示灯和聊天气泡 |
| NotificationWindow | `components/NotificationWindow/` | 悬浮球上方的独立透明通知窗口 |
| ChatPanel | `components/ChatPanel/` | 对话面板，含 TabBar、SessionTab、SessionListView、MessageInput |
| SettingsPanel | `components/SettingsPanel/` | 设置面板（远程服务器、通知配置） |

### packages/session-monitor — 会话监控

| 文件 | 职责 |
|------|------|
| `session-store.ts` | 会话状态机（状态转换、权限模式、通知管理） |
| `socket-server.ts` | WebSocket 服务，接收 Claude Code Hook 事件 |
| `hook-installer.ts` | Claude Code Hook 安装/卸载 |
| `jsonl-parser.ts` | JSONL 会话文件解析与监听 |
| `terminal-jumper.ts` | 终端窗口检测与焦点切换 |
| `types.ts` | 类型定义、状态机、阶段优先级 |

### packages/stream-json — 流式协议

| 文件 | 职责 |
|------|------|
| `stream-session.ts` | 以 `--output-format stream-json` 启动 Claude Code，管理 stdio 管道 |
| `types.ts` | 流式事件类型定义 |

### packages/remote — 远程会话

| 文件 | 职责 |
|------|------|
| `shared/protocol.ts` | WebSocket 消息协议类型 |
| `client/remote-manager.ts` | WebSocket 连接管理器 |
| `client/remote-hook-adapter.ts` | 远程 Hook 事件处理 |
| `client/remote-stream-adapter.ts` | 远程流式会话处理 |

## 数据流

```
Claude Code Hook ──► socket-server ──► SessionStore.process()
                                           │
                                  ┌────────┴────────┐
                                  ▼                 ▼
                        broadcastToRenderer    resolveDisplayState
                                  │                 │
                                  ▼                 ▼
                         ChatPanel 更新       FloatingBall 状态灯
                                  ▲                 │
                        用户审批/拒绝 (IPC)           ▼
                              │              NotificationWindow
                              ▼
                    pendingPermissionResolvers ──► Hook 响应
```

## 关键设计决策

1. **多窗口架构** — 悬浮球、对话面板、设置面板、通知窗口各自独立 BrowserWindow。
2. **状态机驱动** — SessionStore 维护每个 Claude Code 会话的校验阶段转换。
3. **权限代理** — Hook 的 `onPermissionRequest` 通过 Promise 挂起，用户在 UI 审批后 resolve。
4. **JSONL 实时监听** — 通过增量解析会话文件实现对话内容实时同步。
5. **Dock 隐藏 + 系统托盘** — `LSUIElement` + `app.dock.hide()` 实现 macOS 纯托盘模式。

## 技术栈

- **运行时：** Electron 34+
- **UI：** React 18, TypeScript
- **构建：** electron-vite, electron-builder
- **通信：** WebSocket (ws)
- **渲染：** react-markdown, remark-gfm
- **包管理：** pnpm 9+

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm typecheck

# 运行测试
pnpm test

# 打包 macOS 应用
pnpm package
```

## 许可证

MIT
