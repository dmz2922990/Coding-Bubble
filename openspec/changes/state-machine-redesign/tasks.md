## 1. Core Type Definitions

- [ ] 1.1 Update `SessionPhaseType` in `packages/session-monitor/src/types.ts` — add `thinking`, `done`, `error`
- [ ] 1.2 Update `SessionPhase` union type — add `{ type: 'thinking' }`, `{ type: 'done' }`, `{ type: 'error' }`
- [ ] 1.3 Update `VALID_TRANSITIONS` matrix with all new transition paths
- [ ] 1.4 Add `STATE_PRIORITY` map to types.ts
- [ ] 1.5 Define `BubbleNotification` type and `NotificationType` in types.ts

## 2. SessionStore State Machine

- [ ] 2.1 Update `newPhase()` factory in session-store.ts to handle `thinking`, `done`, `error`
- [ ] 2.2 Add ONESHOT auto-revert logic — `setupOneshotRevert(session, phase, timeoutMs)` method that sets setTimeout and cancels on new events
- [ ] 2.3 Update `_handleGeneralEvent` — `UserPromptSubmit` → `thinking` (was `processing`)
- [ ] 2.4 Update `_handleGeneralEvent` — `PreToolUse` → transition to `processing` (was no-op)
- [ ] 2.5 Update `_handleGeneralEvent` — `Stop` → `done` (was `waitingForInput`)
- [ ] 2.6 Update `_handleGeneralEvent` — `SubagentStop` → no transition (was `waitingForInput`)
- [ ] 2.7 Add `PostToolUseFailure` handler in `process()` switch → `error`
- [ ] 2.8 Add `StopFailure` handler in `process()` switch → `error`
- [ ] 2.9 Add `SubagentStart` handler in `process()` switch → `processing`
- [ ] 2.10 Add `PostCompact` handler in `process()` switch → `processing` (from `compacting`)
- [ ] 2.11 Add `resolveDisplayState()` method — iterate sessions, return highest-priority phase
- [ ] 2.12 Replace `_updateInterventions` with `_updateNotifications` — track all notification-worthy states

## 3. Hook Installer

- [ ] 3.1 Add `PostToolUseFailure`, `StopFailure`, `SubagentStart`, `PostCompact` to `HOOK_EVENTS` array in hook-installer.ts

## 4. Main Process Integration

- [ ] 4.1 Update `bubbleControllerSync()` in main/index.ts to use new notification model
- [ ] 4.2 Ensure `broadcastToRenderer` carries new phase types correctly

## 5. ChatPanel UI Updates

- [ ] 5.1 Update `SessionPhaseType` in `apps/desktop/src/renderer/components/ChatPanel/types.ts` to match core types
- [ ] 5.2 Update `PHASE_LABELS` in SessionTab.tsx and SessionListView.tsx — add `thinking: '思考中'`, `done: '已完成'`, `error: '出错'`
- [ ] 5.3 Update `TAB_PHASE_COLORS` in TabBar.tsx — add `thinking: '#ab47bc'`, `done: '#66bb6a'`, `error: '#f44336'`
- [ ] 5.4 Update `PHASE_COLORS` in SessionListView.tsx — same as TabBar
- [ ] 5.5 Add CSS badge styles for new phases in styles.css — `.session-tab__phase-badge--thinking`, `--done`, `--error`

## 6. FloatingBall Notification UI

- [ ] 6.1 Update `NotificationBubble.tsx` — extend `PHASE_CONFIG` with `done` and `error` types
- [ ] 6.2 Update `NotificationBubble.tsx` — render done/error notification rows with appropriate icons and labels
- [ ] 6.3 Update `FloatingBall/index.tsx` — adapt to new `BubbleNotification` data model
- [ ] 6.4 Update auto-close logic in NotificationBubble — use `autoCloseMs` from notification data instead of hardcoded check
- [ ] 6.5 Update badge logic — check for `approval` type instead of `waitingForApproval` phase

## 7. Verification

- [ ] 7.1 Verify TypeScript compilation passes
- [ ] 7.2 Verify state transitions follow the new matrix with no invalid transition errors
- [ ] 7.3 Verify ONESHOT auto-revert works correctly for done (3s) and error (5s)
- [ ] 7.4 Verify bubble notifications appear for done/error/approval/input when panel is hidden
- [ ] 7.5 Verify bubble is hidden when panel is visible
