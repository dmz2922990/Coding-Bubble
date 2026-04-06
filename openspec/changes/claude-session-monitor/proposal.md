# Proposal: Claude Session Monitor

## What

Transform Coding-bubble from a self-contained LLM chat assistant into a Claude Code CLI session monitor. The app observes active Claude Code sessions via hooks, displays real-time conversation history, and allows tool-use permission approval from the UI.

## Why

Claude Island (macOS native app) demonstrates the value of monitoring Claude Code sessions from a companion app. Coding-bubble already has the Electron window management, floating ball, and tab infrastructure. By combining the two, we get a cross-platform Claude session monitor with polished UI.

## Scope

### In Scope
- Install Claude Code hooks (Python script + settings.json registration) on app startup
- Unix domain socket server in Electron main process to receive hook events
- Session state machine (idle → processing → waitingForApproval → etc.)
- JSONL file watching and incremental parsing for chat history
- "对话" tab as session list view (cards with status)
- Dynamic session tabs (auto-create/remove based on active sessions)
- Chat history rendering: user messages, assistant responses, tool calls, thinking blocks
- Inline permission approval UI (Allow/Deny) in active session views
- Remove existing LLM backend, emotion, memory, greeting services
- Remove static tabs (notes, tools, history, settings, about)

### Out of Scope
- tmux message sending (coding-bubble doesn't need to send messages to Claude)
- Process tree building for terminal detection
- macOS notch-specific UI (using existing ChatPanel window)
- Analytics (Mixpanel)
- Auto-updates (existing Electron updater is sufficient)

## Impact

- **Deleted**: `packages/backend/` (Fastify server, agent loop, skills), emotion/memory services, static tabs content
- **Deleted**: `packages/shared/` (WebSocket protocol types — replaced by session types)
- **Rewritten**: `apps/desktop/src/main/index.ts` (start socket server + hook installer instead of backend)
- **Rewritten**: `apps/desktop/src/preload/index.ts` (new IPC for session management + permission approval)
- **Rewritten**: `apps/desktop/src/renderer/components/ChatPanel/*` (session monitoring UI)
- **Removed**: `useClawSocket` hook, `useClawEmotion` hook
- **New**: `packages/session-monitor/` (socket server, session store, JSONL parser, hook installer)
- **New**: Hook Python script (based on claude-island-state.py)

## Success Criteria

1. App launches and installs hooks automatically
2. Starting a Claude Code session creates a tab in the panel
3. Chat history renders correctly (messages, tools, thinking)
4. Permission requests show Allow/Deny buttons in the UI
5. Approving/Denying a permission unblocks Claude Code execution
6. Session end removes the tab
7. "对话" tab shows all active sessions as cards
