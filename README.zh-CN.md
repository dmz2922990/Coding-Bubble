# Coding-bubble

一个轻量级的桌面 AI 伴侣，以悬浮球形式常驻屏幕。实时监控 Claude Code 会话、弹出通知、无需切换终端即可审批权限请求。支持 macOS 和 Windows。

## 架构

基于 pnpm monorepo 的三包结构：

```
coding-bubble/
├── apps/desktop/              # Electron 桌面应用
├── packages/session-monitor/  # 会话监控核心逻辑
├── packages/shared/           # 共享类型与工具
├── openspec/                  # 设计文档 (OpenSpec)
├── docs/                      # 分析与设计文档
└── data/                      # 运行时配置 (config.json)
```

## 核心模块

### apps/desktop — Electron 桌面应用

| 层级 | 路径 | 职责 |
|------|------|------|
| Main 进程 | `src/main/index.ts` | 窗口管理（悬浮球/面板/设置）、IPC 通信、权限审批、系统托盘、会话桥接 |
| Renderer | `src/renderer/App.tsx` | 通过 `?view=` URL 参数路由到三个视图 |
| Preload | `src/preload/index.ts` | contextBridge 安全桥接 |

**UI 组件：**

| 组件 | 路径 | 说明 |
|------|------|------|
| FloatingBall | `components/FloatingBall/` | 悬浮球 + 通知气泡 (NotificationBubble) |
| ChatPanel | `components/ChatPanel/` | 对话面板，含 TabBar、SessionTab、SessionListView |
| SettingsPanel | `components/SettingsPanel/` | 设置面板 |

**辅助模块：**

- `hooks/useTabManager.ts` — Tab 切换管理
- `lib/backend-client.ts` — 后端 IPC 调用封装

### packages/session-monitor — 会话监控

| 文件 | 职责 |
|------|------|
| `session-store.ts` | 会话状态机（状态转换、权限模式、通知管理） |
| `socket-server.ts` | WebSocket 服务，接收 Claude Code Hook 事件 |
| `hook-installer.ts` | Claude Code Hook 安装/卸载 |
| `jsonl-parser.ts` | JSONL 会话文件解析与监听 |
| `terminal-jumper.ts` | 终端窗口跳转（将焦点切到对应 Claude Code 终端） |
| `types.ts` | 类型定义 |

### packages/shared — 共享类型

导出跨包共享的 `EmotionState` 和 `EmotionSnapshot` 类型。

## 数据流

```
Claude Code Hook → socket-server → SessionStore.process()
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                    broadcastToRenderer    BubbleController
                              │                 │
                              ▼                 ▼
                       ChatPanel 更新      FloatingBall 通知气泡
                              ▲
                    用户审批/拒绝 (IPC)
                              │
                              ▼
                    pendingPermissionResolvers → Hook 响应
```

## 关键设计决策

1. **三窗口架构** — 悬浮球（透明穿透）、对话面板、设置面板各自独立 BrowserWindow。
2. **状态机驱动** — SessionStore 维护每个 Claude Code 会话的 phase 状态转换。
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
