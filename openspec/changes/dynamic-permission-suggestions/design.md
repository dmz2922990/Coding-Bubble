## Context

Coding-bubble is an Electron desktop app that wraps Claude Code, providing a floating ball + panel UI for managing sessions. Permission requests flow through two independent paths:

1. **Hook/Socket path** — Claude Code sends hook events via a Unix domain socket (`socket-server.ts`). `PermissionRequest` events carry `permission_suggestions` in the payload, but the current code only extracts `tool_name` and `tool_input`.
2. **Stream/stdio path** — Claude Code runs as a child process with `--permission-prompt-tool stdio`. The `control_request` message contains `request.permission_suggestions`, but `_handleControlRequest()` ignores it.

The UI (`PermissionBar` in `SessionTab.tsx`) renders 3 hardcoded buttons: 拒绝、允许、一直允许. The "一直允许" button simply sets `permissionMode = 'auto'` (auto-approve all future requests) — it does NOT create persistent rules in Claude Code's settings.

Claude Code's `permission_suggestions` provides context-aware suggestions that users can accept to create specific rules (e.g., "Always allow `npm test:*`") without switching to full auto mode. This data is already being sent but is completely ignored.

## Goals / Non-Goals

**Goals:**
- Parse `permission_suggestions` from both communication paths and surface them as dynamic buttons
- When a suggestion is accepted, construct the proper `updatedPermissions` response so Claude Code persists the rule
- Support `addRules` (most common), `setMode`, and `addDirectories` suggestion types
- Merge multiple `addRules` suggestions (e.g., piped commands `a && b`) into a single button
- Provide localized (zh) labels for suggestion buttons
- Rename "一直允许" to "始终允许"

**Non-Goals:**
- Changing the existing "允许" (Allow) / "拒绝" (Deny) button behavior
- Building complex rule management UI — suggestions are transient per-request
- Supporting suggestion types beyond what Claude Code currently sends (`addRules`, `setMode`, `addDirectories`)
- Modifying Claude Code itself — we only consume what it sends

## Decisions

### Decision 1: Where to store suggestions — extend existing permission data structures

**Choice:** Add `suggestions` field to the existing permission data carriers rather than creating a separate system.

- `StreamEvent` → add `suggestions?: PermissionSuggestion[]`
- `PendingStreamPermission` → add `suggestions: PermissionSuggestion[]`
- `PermissionContext` → add `suggestions: PermissionSuggestion[]`
- `SessionInfo` → add `suggestions?: PermissionSuggestion[]`

**Alternative:** Create a parallel `suggestionStore` alongside `pendingPermissionResolvers`. Rejected — adds unnecessary complexity. Suggestions are ephemeral per-request, they belong alongside the permission they relate to.

### Decision 2: Suggestion merge strategy — same as clawd-on-desk

**Choice:** Merge multiple `addRules` into one button, preserve other types as-is. Identical to clawd-on-desk's proven implementation.

```
addRulesItems = raw.filter(s => s.type === 'addRules')
if (addRulesItems.length > 1) → merge into single entry with flatMapped rules
```

**Rationale:** Piped commands (`a && b`) produce N `addRules` suggestions. Showing N identical-looking buttons is confusing. One merged button is cleaner.

### Decision 3: Response format — different per path

**Hook path:** The hook response format is `{ decision, reason, updatedInput, updatedPermissions }`. The `updatedPermissions` field must be added to `HookResponse`. The socket writes this as JSON back to the Claude Code hook.

**Stream path:** The `respondPermission()` method already sends `control_response` with `{ behavior, updatedInput }`. We extend it to also include `updatedPermissions` in the inner response. Claude Code's `PermissionPromptToolResultSchema` already validates this field.

### Decision 4: IPC channel — reuse existing flow, add `onSuggestion` callback

**Choice:** Add a new `onSuggestion?: (index: number) => void` prop to `PermissionBar` and a new IPC handler pair (`session:suggestion`, `stream:suggestion`) rather than overloading the existing `approve`/`always-allow` channels.

**Rationale:** Suggestion clicks are semantically distinct — they produce `updatedPermissions` data. A dedicated channel keeps the response construction clean and avoids conditional branching in existing handlers.

### Decision 5: Label generation — pure function in renderer

**Choice:** Implement `getSuggestionLabel(suggestion)` as a pure function in `SessionTab.tsx`, matching clawd-on-desk's logic:

| Suggestion | Chinese label |
|---|---|
| `setMode` + `acceptEdits` | 自动接受编辑 |
| `setMode` + `plan` | 切换到 Plan 模式 |
| `addRules` + ruleContent has `**` | 允许 `{tool}` 在 `{dir}/` |
| `addRules` + other ruleContent | 始终允许 `` `{cmd}` `` |
| `addDirectories` | 添加工作目录 `{dir}` |
| Fallback | 始终允许 |

No English labels needed — the app UI is Chinese-only.

### Decision 6: Suggestion type definition — shared across packages

**Choice:** Define `PermissionSuggestion` type in `packages/session-monitor/src/types.ts` (where `HookResponse` and `PendingPermission` already live). Import it in `packages/stream-json/src/types.ts` and `apps/desktop/src/renderer/components/ChatPanel/types.ts`.

## Risks / Trade-offs

**[Breaking change to HookResponse]** → `HookResponse` gains `updatedPermissions` field. The socket writes this as JSON to Claude Code. Claude Code ignores unknown fields in hook responses, so existing flows are unaffected. The addition is backward-compatible.

**[Suggestion index mismatch]** → After dedup, button indices must map back to the original suggestions array. Use the original array index in the click handler (same as clawd-on-desk's `"suggestion:" + i` pattern) to avoid any mismatch.

**[Hook path lacks suggestions in some cases]** → Not all Claude Code versions send `permission_suggestions` via hooks. The field is optional. When missing, fall back to the current behavior (3 fixed buttons). This is a graceful degradation, not an error.

**[Stream path already works]** → Claude Code v2.1.88+ always sends `permission_suggestions` in `control_request`. This is the more reliable path. The hook path is secondary.
