# Coding-bubble

A lightweight desktop AI companion that lives as a floating ball on your screen. Monitors Claude Code sessions in real-time, surfaces notifications, and lets you approve permission requests without switching to the terminal. Supports macOS & Windows.

## Architecture

pnpm monorepo with three core packages:

```
coding-bubble/
├── apps/desktop/              # Electron desktop app
├── packages/session-monitor/  # Session monitoring core logic
├── packages/stream-json/      # Stream-json protocol adapter
├── packages/remote/           # Remote session support
├── packages/shared/           # Shared types and utilities
├── openspec/                  # Design documents (OpenSpec)
├── docs/                      # Analysis and design docs
└── data/                      # Runtime config (config.json)
```

## Supported Session Modes

Coding-bubble supports four session source modes, allowing flexibility in how Claude Code sessions are created and managed:

| Mode | Source | Indicator | Description |
|------|--------|-----------|-------------|
| `hook` | Local Hook | Gray dot ● | Claude Code runs independently in a terminal. The hook script (`claude-bubble-state.js`) intercepts session events and forwards them via Unix domain socket. |
| `stream` | Local Stream | Light blue dot ● `#4fc3f7` | The desktop app spawns its own Claude Code process with `--output-format stream-json --input-format stream-json`. Full control over stdin/stdout. |
| `remote-hook` | Remote Hook | Gray diamond ◆ | A remote server runs Claude Code with hooks installed. Events are forwarded to the local desktop app via WebSocket. |
| `remote-stream` | Remote Stream | Light blue diamond ◆ `#4fc3f7` | The desktop app creates a Claude Code session on a remote server via WebSocket, with bidirectional event streaming. |

### Permission Modes

Within each session, the following permission modes are available:

| Permission Mode | Behavior |
|-----------------|----------|
| `default` | Prompt user for approval on each permission request (normal interactive mode) |
| `auto` | Auto-approve all permission requests |
| `bypassPermissions` | Auto-approve (set by Claude Code itself) |

## Remote Mode

Remote mode allows you to monitor and control Claude Code sessions running on **remote devices** from your local desktop app, using WebSocket communication.

### Architecture

```
Remote Device (Server)                     Local Desktop (Client)
┌─────────────────────┐                    ┌──────────────────────────┐
│ Claude Code CLI     │                    │ Electron Desktop App    │
│   ↕ hook script     │                    │   ↕ SessionStore / UI   │
│ SocketServer        │                    │   ↕ RemoteManager       │
│   ↕ HookCollector   │◄─── WebSocket ────►│   ↕ RemoteHookAdapter   │
│   ↕ StreamHandler   │   (port 9527)      │   ↕ RemoteStreamAdapter │
│ StreamSession       │                    └──────────────────────────┘
└─────────────────────┘
```

### Quick Start

**1. Start the remote server on the remote device:**

```bash
# Build the server
pnpm --filter @coding-bubble/remote build

# Run (development)
npx tsx packages/remote/src/server/index.ts --port 9527 --token mysecret

# Or run the bundled version
node packages/remote/dist/coding-bubble-remote-server.js --port 9527 --token mysecret
```

| CLI Option | Default | Description |
|------------|---------|-------------|
| `--port <number>` | `9527` | WebSocket listen port |
| `--token <string>` | none (no auth) | Authentication token |

**2. Configure the desktop app:**

1. Click the floating ball to open the panel
2. Open **Settings** → **Remote Devices** tab
3. Click **Add Server**, fill in:
   - **Name**: a friendly name (e.g. "Dev Server")
   - **Host**: remote device IP or hostname
   - **Port**: `9527` (or your custom port)
   - **Token**: the token you set on the server (optional)
4. Click **Connect**

**3. Use remote sessions:**

- **Remote Hook**: Once connected, any Claude Code session started on the remote device's terminal will automatically appear in the session list. You can approve/deny permission requests from the desktop app.
- **Remote Stream**: Click **"+ Remote Session"** in the session list, select a connected server, browse the remote filesystem to choose a working directory, then create the session.

### Remote Hook vs Remote Stream

| | Remote Hook | Remote Stream |
|---|---|---|
| **Who starts Claude** | You (on remote terminal) | Desktop app (via WebSocket) |
| **Session creation** | Automatic (passive) | Manual via dialog (active) |
| **Message input** | Via remote terminal | Via desktop app input box |
| **Terminal jump** | Supported | Not applicable |
| **Use case** | Monitor existing sessions | Start new sessions remotely |

### Reconnection

The client automatically reconnects with exponential backoff (1s → 2s → 4s → ... → 30s max) when the connection drops.

## Status & Display Logic

### Session Phase State Machine

Each Claude Code session follows a strict state machine with 10 phases and validated transitions:

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
                    compacting ◄──► (from processing/idle/waitingForInput)
                        │
                        └──► ended (terminal state)
```

### Phase Colors

Each session phase has a consistent color used across the floating ball status dot, tab indicator, session list card, and notification badge:

| Phase | Color | Swatch | Animation |
|-------|-------|--------|-----------|
| `idle` | Gray `#888` | ![#888](https://via.placeholder.com/14/888888/888888.png) | — |
| `thinking` | Purple `#ab47bc` | ![#ab47bc](https://via.placeholder.com/14/ab47bc/ab47bc.png) | — |
| `processing` | Blue `#2196f3` | ![#2196f3](https://via.placeholder.com/14/2196f3/2196f3.png) | — |
| `juggling` | Purple `#ab47bc` | ![#ab47bc](https://via.placeholder.com/14/ab47bc/ab47bc.png) | — |
| `done` | Green `#66bb6a` | ![#66bb6a](https://via.placeholder.com/14/66bb6a/66bb6a.png) | — |
| `error` | Red `#f44336` | ![#f44336](https://via.placeholder.com/14/f44336/f44336.png) | Blink (1s) |
| `waitingForInput` | Blue-Gray `#78909c` | ![#78909c](https://via.placeholder.com/14/78909c/78909c.png) | — |
| `waitingForApproval` | Orange `#ff9800` | ![#ff9800](https://via.placeholder.com/14/ff9800/ff9800.png) | Pulse (1.5s) |
| `compacting` | Blue `#2196f3` | ![#2196f3](https://via.placeholder.com/14/2196f3/2196f3.png) | — |
| `ended` | Light Gray `#9e9e9e` | ![#9e9e9e](https://via.placeholder.com/14/9e9e9e/9e9e9e.png) | — |

### Phase Priority (Floating Ball Display)

When multiple sessions are active, the floating ball shows the highest-priority phase:

| Priority | Phase | Meaning |
|----------|-------|---------|
| 8 | `error` | Session encountered an error |
| 7 | `waitingForApproval` | Waiting for user to approve a permission request |
| 6 | `done` | Session completed current task |
| 5 | `waitingForInput` | Waiting for user text input |
| 4 | `compacting` / `juggling` | Context compaction / subagent running |
| 3 | `processing` | Executing tool calls |
| 2 | `thinking` | Claude is thinking |
| 1 | `idle` | No active work |
| 0 | `ended` | Session terminated |

### Auto-Revert Timeouts

Certain phases automatically revert to `idle` if no new events arrive:

| Phase | Timeout |
|-------|---------|
| `done` | 10 seconds |
| `thinking` | 10 minutes |
| `processing` | 10 minutes |
| `juggling` | 10 minutes |

### Notifications

Four notification types with configurable auto-close timing:

| Type | Trigger | Default Auto-Close | Color |
|------|---------|--------------------|-------|
| `approval` | Session enters `waitingForApproval` | Never (requires user action) | Orange `#ff9800` 🔐 |
| `input` | Session enters `waitingForInput` | 15 seconds | Blue-Gray `#78909c` 💬 |
| `done` | Session enters `done` | 15 seconds | Green `#66bb6a` ✅ |
| `error` | Session enters `error` | 30 seconds | Red `#f44336` ❌ |

Notifications appear in a dedicated transparent window positioned above the floating ball. A quick-approval button allows one-click permission granting directly from the notification.

## Terminal Jump Support

The terminal jump feature allows users to click a button in the session list and instantly switch focus to the terminal window running that Claude Code session. Currently **macOS only**.

### Supported Terminals

| Terminal | Detection | Focus Strategy |
|----------|-----------|----------------|
| **Ghostty** | Process name matching | AppleScript (working directory match) |
| **iTerm2** | Process name matching | AppleScript (TTY session match) |
| **Terminal.app** | Process name matching | AppleScript (TTY tab match) |
| **Warp** | Process name matching | Bundle ID activation |
| **kitty** | Process name matching | Remote control (`kitty @ focus-window --match cwd:`) |
| **WezTerm** | Process name matching | CLI (`wezterm cli activate-pane`) |
| **Alacritty** | Process name matching | Bundle ID activation |
| **cmux** | Process name matching | CLI (`cmux find-window --select`) |
| **VS Code** | Process name matching | Bundle ID activation |
| **Cursor** | Process name matching | Bundle ID activation |
| **Zed** | Process name matching | Bundle ID activation |

### Detection & Focus Strategy

1. **Process tree tracing**: Builds a process tree via `ps`, walks ancestors from the Claude Code PID upward to identify the parent terminal
2. **Terminal-specific activation**: Uses the best available strategy for each terminal (AppleScript, CLI, remote control)
3. **tmux support**: When tmux is detected, uses `tmux select-window`/`tmux select-pane` to navigate to the correct pane
4. **Fallback chain**: Ghostty → iTerm2 → Terminal.app → Warp → kitty

## Core Modules

### apps/desktop — Electron App

| Layer | Path | Responsibility |
|-------|------|----------------|
| Main | `src/main/index.ts` | Window management (ball/panel/settings/notification), IPC, permission approval, system tray, session bridge |
| Renderer | `src/renderer/App.tsx` | Routes to views via `?view=` URL parameter |
| Preload | `src/preload/index.ts` | contextBridge IPC bridge |

**UI Components:**

| Component | Path | Description |
|-----------|------|-------------|
| FloatingBall | `components/FloatingBall/` | Draggable floating ball with status dot + chat bubbles |
| NotificationWindow | `components/NotificationWindow/` | Separate transparent window for notifications above the ball |
| ChatPanel | `components/ChatPanel/` | Conversation panel with TabBar, SessionTab, SessionListView, MessageInput |
| SettingsPanel | `components/SettingsPanel/` | Settings panel (remote servers, notification config) |

### packages/session-monitor — Session Monitoring

| File | Responsibility |
|------|----------------|
| `session-store.ts` | Session state machine (phase transitions, permission modes, notifications) |
| `socket-server.ts` | WebSocket server receiving Claude Code hook events |
| `hook-installer.ts` | Claude Code hook install/uninstall |
| `jsonl-parser.ts` | JSONL session file parsing and watching |
| `terminal-jumper.ts` | Terminal window detection and focus switching |
| `types.ts` | Type definitions, state machine, phase priorities |

### packages/stream-json — Stream Protocol

| File | Responsibility |
|------|----------------|
| `stream-session.ts` | Spawns Claude Code with `--output-format stream-json`, manages stdio pipes |
| `types.ts` | Stream event type definitions |

### packages/remote — Remote Sessions

| File | Responsibility |
|------|----------------|
| `shared/protocol.ts` | WebSocket message protocol types |
| `client/remote-manager.ts` | WebSocket connection manager |
| `client/remote-hook-adapter.ts` | Remote hook event handling |
| `client/remote-stream-adapter.ts` | Remote stream session handling |

## Data Flow

```
Claude Code Hook ──► socket-server ──► SessionStore.process()
                                           │
                                  ┌────────┴────────┐
                                  ▼                 ▼
                        broadcastToRenderer    resolveDisplayState
                                  │                 │
                                  ▼                 ▼
                         ChatPanel update     FloatingBall status dot
                                  ▲                 │
                        User approve/deny           ▼
                              │              NotificationWindow
                              ▼
                    pendingPermissionResolvers ──► Hook response
```

## Key Design Decisions

1. **Multi-window architecture** — Floating ball, conversation panel, settings panel, and notification window are independent BrowserWindows.
2. **State machine driven** — SessionStore maintains validated phase transitions for each Claude Code session.
3. **Permission proxy** — Hook `onPermissionRequest` suspends via Promise, resolves when user approves in UI.
4. **Real-time JSONL watching** — Incremental session content parsing for live conversation sync.
5. **Dock hidden + system tray** — `LSUIElement` + `app.dock.hide()` for tray-only mode on macOS.

## Tech Stack

- **Runtime:** Electron 34+
- **UI:** React 18, TypeScript
- **Build:** electron-vite, electron-builder
- **Communication:** WebSocket (ws)
- **Rendering:** react-markdown, remark-gfm
- **Package Manager:** pnpm 9+

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build
pnpm build

# Type check
pnpm typecheck

# Run tests
pnpm test

# Package for macOS
pnpm package
```

## License

MIT
