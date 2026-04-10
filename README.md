# Coding-bubble

A lightweight desktop AI companion that lives as a floating ball on your screen. Monitors Claude Code sessions in real-time, surfaces notifications, and lets you approve permission requests without switching to the terminal. Supports macOS & Windows.

## Architecture

pnpm monorepo with three packages:

```
coding-bubble/
├── apps/desktop/              # Electron desktop app
├── packages/session-monitor/  # Session monitoring core logic
├── packages/shared/           # Shared types and utilities
├── openspec/                  # Design documents (OpenSpec)
├── docs/                      # Analysis and design docs
└── data/                      # Runtime config (config.json)
```

## Core Modules

### apps/desktop — Electron App

| Layer | Path | Responsibility |
|-------|------|----------------|
| Main | `src/main/index.ts` | Window management (ball/panel/settings), IPC, permission approval, system tray, session bridge |
| Renderer | `src/renderer/App.tsx` | Routes to three views via `?view=` URL parameter |
| Preload | `src/preload/index.ts` | contextBridge IPC bridge |

**UI Components:**

| Component | Path | Description |
|-----------|------|-------------|
| FloatingBall | `components/FloatingBall/` | Floating ball + notification bubble (NotificationBubble) |
| ChatPanel | `components/ChatPanel/` | Conversation panel with TabBar, SessionTab, SessionListView |
| SettingsPanel | `components/SettingsPanel/` | Settings panel |

**Supporting modules:**

- `hooks/useTabManager.ts` — Tab switching management
- `lib/backend-client.ts` — Backend IPC call wrapper

### packages/session-monitor — Session Monitoring

| File | Responsibility |
|------|----------------|
| `session-store.ts` | Session state machine (phase transitions, permission modes, notification management) |
| `socket-server.ts` | WebSocket server receiving Claude Code hook events |
| `hook-installer.ts` | Claude Code hook install/uninstall |
| `jsonl-parser.ts` | JSONL session file parsing and watching |
| `terminal-jumper.ts` | Terminal window focus switching |
| `types.ts` | Type definitions |

### packages/shared — Shared Types

Exports `EmotionState` and `EmotionSnapshot` types shared across packages.

## Data Flow

```
Claude Code Hook → socket-server → SessionStore.process()
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                    broadcastToRenderer    BubbleController
                              │                 │
                              ▼                 ▼
                       ChatPanel update   FloatingBall notification
                              ▲
                    User approve/deny (IPC)
                              │
                              ▼
                    pendingPermissionResolvers → Hook response
```

## Key Design Decisions

1. **Three-window architecture** — Floating ball (transparent, click-through), conversation panel, and settings panel are independent BrowserWindows.
2. **State machine driven** — SessionStore maintains phase state transitions for each Claude Code session.
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
