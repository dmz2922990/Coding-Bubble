## 1. Main Process — IPC Bridge

- [x] 1.1 Add `bubble:status` IPC event in `bubbleControllerSync()` — send `resolveDisplayState()` result to ball window
- [x] 1.2 Ensure status is sent on both session state change and panel visibility change

## 2. Preload — IPC Exposure

- [x] 2.1 Add `onBubbleStatus` IPC listener in preload/index.ts to receive `bubble:status` events

## 3. FloatingBall — Status Dot Rendering

- [x] 3.1 Add `displayState` state in FloatingBall/index.tsx — subscribe to `bubble:status` IPC event
- [x] 3.2 Render status dot element in JSX — positioned at bottom-right of ball, conditionally visible
- [x] 3.3 Pass `displayState` as `data-status` attribute to the dot element

## 4. CSS — Status Dot Styles

- [x] 4.1 Add `.ball__status-dot` base style — 8px circle, position bottom-right, transition 0.3s
- [x] 4.2 Add color classes for each state: `--thinking`, `--processing`, `--done`, `--error`, `--waitingForApproval`, `--waitingForInput`, `--compacting`
- [x] 4.3 Add pulse animation for `--waitingForApproval`
- [x] 4.4 Add blink animation for `--error`

## 5. Verification

- [x] 5.1 Verify TypeScript compilation passes
- [ ] 5.2 Verify status dot appears when panel is closed and sessions are active
- [ ] 5.3 Verify status dot hides when panel is opened
- [ ] 5.4 Verify status dot hides when all sessions are idle/ended
- [ ] 5.5 Verify color transitions smoothly between states
