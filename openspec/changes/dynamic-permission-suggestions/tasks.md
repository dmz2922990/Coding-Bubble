## 1. Shared Type Definitions

- [x] 1.1 Define `PermissionSuggestion` type in `packages/session-monitor/src/types.ts` — support `addRules`, `setMode`, `addDirectories` variants with discriminated union
- [x] 1.2 Add `suggestions?: PermissionSuggestion[]` field to `StreamEvent` interface in `packages/stream-json/src/types.ts`
- [x] 1.3 Add `updatedPermissions?: PermissionSuggestion[]` field to `HookResponse` interface in `packages/session-monitor/src/types.ts`
- [x] 1.4 Add `updatedPermissions` support to `PermissionResult` interface in `packages/stream-json/src/types.ts`
- [x] 1.5 Add `suggestions?: PermissionSuggestion[]` field to `SessionInfo` interface in `apps/desktop/src/renderer/components/ChatPanel/types.ts`
- [x] 1.6 Add `suggestions` field to `PermissionContext` interface in `packages/session-monitor/src/types.ts`

## 2. Suggestion Merge Utility

- [x] 2.1 Create `mergeSuggestions()` function in `packages/session-monitor/src/types.ts` (or a new utility file) — merge multiple `addRules` into one entry with flatMapped `rules`, preserve non-addRules types

## 3. Stream Path — Parse & Pass Suggestions

- [x] 3.1 In `packages/stream-json/src/stream-session.ts` `_handleControlRequest()`: extract `request.permission_suggestions` as array, include in emitted `StreamEvent`
- [x] 3.2 In `apps/desktop/src/main/stream-adapter.ts` `PendingStreamPermission` interface: add `suggestions: PermissionSuggestion[]` field
- [x] 3.3 In `stream-adapter.ts` `handleStreamEvent()` `permission_request` case: pass suggestions from event into `PendingStreamPermission` entry

## 4. Hook Path — Parse & Pass Suggestions

- [x] 4.1 In `packages/session-monitor/src/socket-server.ts`: extract `payload.permission_suggestions` from `PermissionRequest` hook events, pass to `onPermissionRequest` callback
- [x] 4.2 Update `SocketServerOptions.onPermissionRequest` signature to include `suggestions: PermissionSuggestion[]` parameter
- [x] 4.3 In `apps/desktop/src/main/index.ts`: store suggestions in `pendingPermissionResolvers` entry alongside toolName/toolInput

## 5. Session Store — Broadcast Suggestions to Renderer

- [x] 5.1 In `packages/session-monitor/src/session-store.ts` `_handlePermissionRequest()`: store merged suggestions in the session's `waitingForApproval` phase context
- [x] 5.2 In `session-store.ts` `toJSON()`: include `suggestions` in the serialized `SessionInfo` output so renderer receives it

## 6. IPC Channels — Suggestion Decision Handlers

- [x] 6.1 Add `session.suggestion(sessionId, index)` to `apps/desktop/src/preload/index.ts` — maps to `ipcRenderer.invoke('session:suggestion', ...)`
- [x] 6.2 Add `stream.suggestion(sessionId, index)` to `apps/desktop/src/preload/index.ts` — maps to `ipcRenderer.invoke('stream:suggestion', ...)`
- [x] 6.3 Add `ipcMain.handle('session:suggestion', ...)` in `apps/desktop/src/main/index.ts` — look up suggestion by index, resolve pending permission with `updatedPermissions`
- [x] 6.4 Add `ipcMain.handle('stream:suggestion', ...)` in `apps/desktop/src/main/index.ts` — look up suggestion by index, call stream adapter with `updatedPermissions`

## 7. Stream Adapter — Suggestion Response

- [x] 7.1 Add `suggestionPermission(sessionId, index)` method to `StreamAdapterManager` in `stream-adapter.ts` — resolve with `updatedPermissions` from stored suggestion
- [x] 7.2 Update `stream-session.ts` `respondPermission()`: include `updatedPermissions` in the `control_response` inner response when provided

## 8. Renderer UI — Dynamic PermissionBar

- [x] 8.1 Add `onSuggestion?: (index: number) => void` and `suggestions?: PermissionSuggestion[]` props to `PermissionBar` component in `SessionTab.tsx`
- [x] 8.2 Implement `getSuggestionLabel(suggestion)` pure function — generate Chinese labels for `addRules`, `setMode`, `addDirectories` types
- [x] 8.3 Update `PermissionBar` rendering: when `suggestions` is non-empty, render dynamic suggestion buttons (deduplicated by label) instead of "一直允许"; when empty, render only 拒绝/允许
- [x] 8.4 Rename "一直允许" to "始终允许" in any remaining context where it appears
- [x] 8.5 Wire `onSuggestion` prop from `SessionTab` through to `PermissionBar` — route to `session.suggestion()` or `stream.suggestion()` based on session source
- [x] 8.6 Add CSS styles for suggestion buttons (`.permission-bar__btn--suggestion`) matching existing button design

## 9. Remote Stream Support

- [x] 9.1 Add `remote.stream.suggestion(sessionId, index)` to preload `remote.stream` section
- [x] 9.2 Add `ipcMain.handle('remote:stream:suggestion', ...)` in `index.ts` — route to remote stream adapter
- [x] 9.3 Ensure remote stream adapter's permission handling passes suggestions through (verify existing `handleStreamEvent` reuse covers this)

## 10. Verification

- [ ] 10.1 Test stream path: verify `control_request` with `permission_suggestions` produces suggestion buttons in UI
- [ ] 10.2 Test hook path: verify `PermissionRequest` with `permission_suggestions` produces suggestion buttons in UI
- [ ] 10.3 Test no suggestions: verify UI falls back to 拒绝/允许 only (no "一直允许")
- [ ] 10.4 Test suggestion click: verify `updatedPermissions` is correctly sent back in both paths
- [ ] 10.5 Test merge: verify piped commands (`a && b`) produce a single merged suggestion button
- [x] 10.6 Verify TypeScript compilation passes with no type errors
