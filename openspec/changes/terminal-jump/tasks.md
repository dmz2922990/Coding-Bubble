## 1. PID Propagation

- [x] 1.1 Update Python hook (`claude-bubble-state.py`) to include `pid: os.getpid()` in every event payload sent to the socket server
- [x] 1.2 Verify `SessionState` type already has `pid?: number` field (confirm in `types.ts`)
- [x] 1.3 Update `session-store.ts` `_createSession` and `_handleGeneralEvent` to extract and persist `pid` from incoming hook events

## 2. Terminal Jumper Module

- [x] 2.1 Create `packages/session-monitor/src/terminal-jumper.ts` with `PlatformTerminalJumper` interface and `TerminalJumper` class
- [x] 2.2 Implement terminal registry: static map of terminal process names to Bundle IDs (Ghostty, iTerm2, Terminal.app, Warp, Kitty, WezTerm, Alacritty, cmux, VS Code, Cursor, Zed)
- [x] 2.3 Implement `detectTerminal(pid)` — execute `ps -eo pid,ppid,tty,comm`, build process tree, trace ancestors until matching a known terminal name
- [x] 2.4 Implement tmux strategy — `TmuxTargetFinder` logic: list tmux panes, match PID, derive `session:window.pane` target
- [x] 2.5 Implement tmux + yabai activation — `tmux select-window/pane` + `yabai -m window --focus`
- [x] 2.6 Implement iTerm2 strategy — AppleScript with TTY matching to locate and focus the correct tab/session
- [x] 2.7 Implement Ghostty strategy — AppleScript with `working directory` matching
- [x] 2.8 Implement Terminal.app strategy — AppleScript with tab title/history matching
- [x] 2.9 Implement Kitty strategy — `kitty @ focus-window --match "cwd:<cwd>"` CLI
- [x] 2.10 Implement WezTerm strategy — `wezterm cli list` + cwd matching + activate
- [x] 2.11 Implement cmux strategy — `cmux find-window --content --select` + activate
- [x] 2.12 Implement Bundle ID fallback — AppleScript `activate` for detected terminal, or priority-ordered list of common terminals
- [x] 2.13 Implement `jump(session)` orchestration — try strategies in order, catch failures, fall through gracefully

## 3. IPC Bridge

- [x] 3.1 Add `session:jump-to-terminal` IPC handler in `apps/desktop/src/main/index.ts` — look up session, call `terminalJumper.jump()`, return result
- [x] 3.2 Expose `session.jumpToTerminal(sessionId)` in `apps/desktop/src/preload/index.ts`
- [x] 3.3 Add TypeScript type for `jumpToTerminal` in `env.d.ts`

## 4. UI

- [x] 4.1 Add jump button icon in `SessionTab.tsx` header, right of phase badge, calling `onJumpToTerminal` prop
- [x] 4.2 Wire `onJumpToTerminal` prop from `ChatPanel/index.tsx` through to `SessionTab`, calling `window.electronAPI.session.jumpToTerminal(sessionId)`
- [x] 4.3 Add CSS styles for the jump button in `styles.css` — icon-only button, subtle hover effect, fits header layout
- [x] 4.4 Verify button is visible on all session phases including ended

## 5. Integration & Testing

- [x] 5.1 Run TypeScript type check (`pnpm typecheck`) and fix any errors
- [x] 5.2 Run linter (`pnpm lint`) and fix any issues
- [ ] 5.3 Manual test: start a Claude session, verify PID appears in session state, click jump button, confirm terminal is focused
- [ ] 5.4 Manual test: test with at least two different terminals (e.g., Ghostty and iTerm2)
- [ ] 5.5 Manual test: test fallback when terminal cannot be precisely located
