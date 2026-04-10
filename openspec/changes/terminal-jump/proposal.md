## Why

When a user monitors multiple Claude Code sessions via the Coding-Bubble panel, they need a quick way to switch to the terminal where a specific session is running. Currently there is no mechanism to locate or focus the correct terminal tab/window from the panel UI, forcing users to manually search through open terminals.

## What Changes

- Add a "jump to terminal" button in each session tab header (next to the phase badge), visible for all sessions regardless of phase.
- Python hook script sends the Claude process PID (`os.getpid()`) with each event so the app can trace the terminal process.
- New `terminal-jumper` module (independent file) implements layered terminal detection and activation:
  - Process tree analysis to detect which terminal app hosts the session.
  - Platform-specific strategies (macOS first: AppleScript, tmux, CLI tools).
  - Graceful fallback to application-level activation via Bundle ID.
- New IPC channel `session:jump-to-terminal` bridges renderer request to main process execution.
- Preload API exposes the jump action to the renderer.

## Capabilities

### New Capabilities
- `terminal-jump`: End-to-end terminal jump feature — PID propagation, terminal detection, platform-specific activation, and UI trigger.

### Modified Capabilities
<!-- No existing capabilities are modified. -->

## Impact

- **packages/session-monitor/resources/claude-bubble-state.py**: Add PID field to outgoing events.
- **packages/session-monitor/src/types.ts**: Add `pid` to `SessionState` if not already persisted.
- **packages/session-monitor/src/session-store.ts**: Persist PID from hook events.
- **apps/desktop/src/main/index.ts**: Register new IPC handler `session:jump-to-terminal`.
- **apps/desktop/src/preload/index.ts**: Expose jump API to renderer.
- **apps/desktop/src/renderer/components/ChatPanel/SessionTab.tsx**: Add jump button in header.
- **apps/desktop/src/renderer/components/ChatPanel/styles.css**: Style the jump button.
- New file: Terminal jumper module (exact location TBD in design phase).
- macOS-only for initial release; Windows support deferred but architecture allows future extension.
