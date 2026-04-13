## Why

Coding-bubble currently only monitors local Claude Code sessions via Unix Socket (hook mode) and child process stdio (stream mode). When Claude Code runs on a remote device (e.g., server, VM, embedded device), users cannot monitor or interact with those sessions from their local desktop. A remote mode is needed to extend the existing hook and stream capabilities across the network, enabling centralized monitoring and control of Claude Code sessions on remote devices.

## What Changes

- Add a **remote transport layer** that establishes a persistent, bidirectional connection between a remote server (on the device running Claude Code) and the local client (the Coding-bubble desktop app)
- Add **remote hook mode**: the remote server collects local hook events and forwards them to the client; the client reuses existing hook session logic (SessionStore, ChatPanel, FloatingBall) to display them; permission requests from the remote device are relayed to the client for approval and the decision is sent back
- Add **remote stream mode**: the remote server runs `claude` CLI with stream-json protocol and relays stdin/stdout through the socket; the client reuses existing StreamSession/StreamAdapterManager logic for display and interaction
- Support **multiple concurrent remote sessions** of both hook and stream types from one or more remote servers
- Remote hook sessions support **dynamic tab creation/closure** driven by remote messages
- Remote stream sessions integrate into the existing **"new session" dialog** with remote project directory selection

## Capabilities

### New Capabilities
- `remote-transport`: Persistent bidirectional communication channel between remote server and local client. Covers connection lifecycle (connect, reconnect, disconnect), message framing/serialization, authentication, and multiplexing of multiple sessions over a single connection
- `remote-hook`: Server-side hook event collection and forwarding, client-side hook event ingestion into SessionStore, and bidirectional permission request/response relay. Covers all existing local hook session functionality (phase transitions, tool calls, notifications, permissions) over the remote transport
- `remote-stream`: Server-side claude CLI spawn with stream-json relay over the remote transport, client-side stream session creation and interaction (send messages, approve/deny permissions, interrupt). Remote project directory browsing and session lifecycle management

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **packages/session-monitor**: SessionStore needs to accept remote-sourced events (new `source: 'remote-hook' | 'remote-stream'`) alongside existing `hook` and `stream` sources. Socket server remains unchanged for local hooks.
- **packages/stream-json**: StreamSession may need a remote variant that communicates over the remote transport instead of local child process stdio, or an adapter that translates remote transport messages into StreamEvent objects.
- **apps/desktop (main process)**: New connection management UI/IPC, remote server configuration, and routing of remote events into existing SessionStore/StreamAdapterManager.
- **apps/desktop (renderer)**: "New session" dialog needs remote project directory selection. Tab management needs to handle dynamic creation/closure from remote hook messages.
- **New dependencies**: WebSocket or TCP socket library for remote transport (e.g., `ws`, or raw `net` with a custom protocol).
- **Remote server component**: A new standalone Node.js process to run on remote devices, responsible for hook collection, claude CLI spawning, and transport communication.
