## Context

Coding-Bubble is an Electron + React desktop app that monitors Claude Code sessions. Each session runs inside a terminal (Ghostty, iTerm2, Terminal.app, etc.) and the app displays session status in a floating panel. Currently there is no way to navigate from the panel to the corresponding terminal — users must manually locate the correct terminal tab/window.

The reference implementation (CodeIsland) uses Swift with `ProcessTreeBuilder`, `TerminalJumper`, and `TerminalAppRegistry`. This design translates that approach to Electron/Node.js with platform abstraction for future Windows support.

## Goals / Non-Goals

**Goals:**
- One-click navigation from any session tab to the terminal running that session.
- Automatic terminal detection via process tree analysis (no manual configuration).
- Precise tab-level focus for terminals that support it (iTerm2, Ghostty, Kitty, tmux+yabai, etc.).
- Graceful fallback to application-level activation for terminals without precise APIs.
- macOS implementation first; architecture supports future Windows extension.

**Non-Goals:**
- Windows implementation in this change (deferred).
- Real-time tracking of which terminal tab is active (jump on demand only).
- Detecting or managing terminal sessions that were not launched by Claude Code.

## Decisions

### D1: PID propagation via Python hook

**Decision**: The Python hook script (`claude-bubble-state.py`) appends `pid` (via `os.getpid()`) to every event payload. The session-store persists it in `SessionState.pid`.

**Rationale**: The hook runs inside the Claude Code process tree, so `os.getpid()` gives the exact PID. This is simpler and more reliable than having the Electron main process try to discover the PID externally (which has race conditions with session start). The PID is the anchor for all subsequent process tree analysis.

**Alternative considered**: Running `ps` from main process on session start to find Claude processes by cwd — rejected because of timing issues and ambiguity when multiple sessions share the same cwd.

### D2: Terminal jumper as standalone module

**Decision**: Create a single `terminal-jumper.ts` file in `packages/session-monitor/src/` that encapsulates all terminal detection and activation logic.

**Rationale**: Keeps terminal-specific code isolated from session management and IPC. Single file because the total complexity is moderate (~200-300 lines). If it grows significantly, it can be split later.

**Alternative considered**: Separate files for detection, activation, registry — over-engineering for the current scope.

### D3: Platform abstraction via strategy interface

**Decision**: Export a `TerminalJumper` class with a `jump(session: SessionState): Promise<void>` method. Internally delegates to platform-specific implementations through a simple interface:

```typescript
interface PlatformTerminalJumper {
  detectTerminal(pid: number): Promise<TerminalInfo | null>
  focusTerminal(info: TerminalInfo, session: SessionState): Promise<void>
}
```

macOS implementation lives in the same file (conditional import or runtime platform check). Windows implementation can be added later by implementing the same interface.

**Rationale**: Clean separation without premature file splitting. The interface contract is stable — Windows just needs a different `detectTerminal`/`focusTerminal` pair.

### D4: Layered fallback strategy (same as CodeIsland)

**Decision**: Three-tier activation strategy:
1. **tmux + yabai** — Most precise: locates exact pane within tmux session and focuses the hosting window via yabai.
2. **Terminal-specific** — Per-terminal AppleScript or CLI commands for tab-level focus (iTerm2, Ghostty, Terminal.app, Kitty, WezTerm, cmux).
3. **Bundle ID activation** — Generic: `NSRunningApplication.activate()` equivalent via Electron shell/AppleScript.

**Rationale**: Proven approach from CodeIsland. Maximizes precision where possible, guarantees at least application-level focus everywhere.

### D5: UI button placement

**Decision**: Add an icon button (arrow-up-right icon) in `session-tab__header`, to the right of the phase badge. Always visible for all sessions. On click, calls IPC `session:jump-to-terminal` with the session ID.

**Rationale**: Consistent placement across all session states. Small, non-intrusive icon that doesn't compete with the phase badge for attention.

### D6: Terminal registry

**Decision**: A static `Map<string, string>` mapping terminal process names to Bundle IDs, embedded in the terminal jumper module. Covers: Ghostty, iTerm2, Terminal.app, Warp, Kitty, WezTerm, Alacritty, cmux, VS Code, Cursor, Zed.

**Rationale**: Simple lookup table. No external configuration needed. Easy to extend.

## Risks / Trade-offs

- **[Process tree traversal on every jump]** → Mitigation: `ps` execution is fast (~10ms). Cache terminal info per session if performance becomes an issue.
- **[AppleScript dependency for precise tab focus]** → Mitigation: AppleScript failures are caught and fall through to Bundle ID activation. No user-facing error.
- **[tmux/yabai not installed]** → Mitigation: Detection checks for tmux availability before attempting strategy 1. If absent, skip to strategy 2/3.
- **[Session ended but terminal still open]** → Mitigation: Jump uses persisted PID + cwd. If PID is stale, process tree fails gracefully and falls back to activating the terminal app by Bundle ID or cwd-based search.
- **[macOS-only initially]** → Trade-off: Windows users get no functionality until implemented. Architecture is ready for extension via the `PlatformTerminalJumper` interface.
