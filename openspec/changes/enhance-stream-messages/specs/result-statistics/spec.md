## ADDED Requirements

### Requirement: StreamSession extracts usage data from result messages
StreamSession SHALL extract usage, cost, and duration fields from `result` SDK messages and include them in the existing `result` internal event.

#### Scenario: Successful result with usage
- **WHEN** Claude Code CLI sends a `result` message with `{ subtype: "success", duration_ms: 12340, duration_api_ms: 8900, total_cost_usd: 0.05, usage: { input_tokens: 1000, output_tokens: 500 } }`
- **THEN** StreamSession emits a `result` event including `durationMs: 12340`, `durationApiMs: 8900`, `costUsd: 0.05`, `inputTokens: 1000`, `outputTokens: 500`

#### Scenario: Error result with partial usage
- **WHEN** Claude Code CLI sends a `result` message with `{ subtype: "error_during_execution", duration_ms: 5000, total_cost_usd: 0.02, usage: {...} }`
- **THEN** StreamSession emits a `result` event including the available usage fields

### Requirement: StreamAdapter creates result summary ChatItem
StreamAdapter SHALL handle `result` events by creating a `resultSummary` ChatItem appended to the session history, displaying token usage, duration, and cost.

#### Scenario: Result summary displayed after turn
- **WHEN** StreamAdapter receives a `result` event with usage data
- **THEN** a new ChatItem with `type: 'resultSummary'` is created containing duration, token counts, and cost

#### Scenario: Result without usage data
- **WHEN** StreamAdapter receives a `result` event without usage fields
- **THEN** no resultSummary ChatItem is created (graceful degradation)

### Requirement: Renderer displays result summary card
The renderer SHALL render `resultSummary` ChatItems as a compact summary card showing:
- Duration (formatted as "Xs" or "Xm Ys")
- Token usage (input + output)
- Cost in USD (if available)

#### Scenario: Full result summary card
- **WHEN** a resultSummary ChatItem has durationMs=12340, inputTokens=1000, outputTokens=500, costUsd=0.05
- **THEN** the card displays "12s · 1,500 tokens · $0.05"

#### Scenario: Result summary without cost
- **WHEN** a resultSummary ChatItem has durationMs=5000, inputTokens=500, outputTokens=200, costUsd=0
- **THEN** the card displays "5s · 700 tokens"
