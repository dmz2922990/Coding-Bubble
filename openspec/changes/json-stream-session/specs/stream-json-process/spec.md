## ADDED Requirements

### Requirement: Spawn Claude Code child process with stream-json mode
The system SHALL spawn a Claude Code CLI process with `--output-format stream-json --input-format stream-json --permission-prompt-tool stdio` flags. The process SHALL be started via Node.js `child_process.spawn` with stdin and stdout piped. The environment SHALL have all `CLAUDECODE*` environment variables removed to prevent nested session detection.

#### Scenario: Create new stream session
- **WHEN** user requests a new stream session with a working directory
- **THEN** system spawns `claude` with stream-json flags and the specified cwd, filters CLAUDECODE env vars, and begins reading stdout

#### Scenario: Resume existing session
- **WHEN** user requests to resume a session with a known Claude session ID
- **THEN** system spawns `claude` with `--resume <session-id>` in addition to stream-json flags

#### Scenario: Continue most recent session
- **WHEN** user requests to continue the most recent session
- **THEN** system spawns `claude` with `--continue --fork-session` flags

### Requirement: Read and parse stdout JSON lines
The system SHALL read stdout line-by-line using Node.js `readline` interface with a configurable maximum line length (default 10MB). Each line SHALL be parsed as JSON. Lines exceeding the max buffer SHALL be logged and skipped. The system SHALL dispatch events based on the `"type"` field of each JSON object.

#### Scenario: Receive system init event
- **WHEN** stdout produces `{"type":"system","session_id":"abc-123","subtype":"init"}`
- **THEN** system extracts and stores the `session_id` for subsequent resume operations

#### Scenario: Receive assistant text event
- **WHEN** stdout produces an assistant event with `content` array containing `{"type":"text","text":"..."}`
- **THEN** system emits a text event with the content string

#### Scenario: Receive assistant tool_use event
- **WHEN** stdout produces an assistant event with `content` array containing `{"type":"tool_use","id":"toolu_xxx","name":"Bash","input":{...}}`
- **THEN** system emits a tool_use event with tool name, input, and tool use ID

#### Scenario: Receive thinking event
- **WHEN** stdout produces an assistant event with `content` array containing `{"type":"thinking","thinking":"..."}`
- **THEN** system emits a thinking event with the thinking content

#### Scenario: Receive result event (turn complete)
- **WHEN** stdout produces `{"type":"result","result":"...","session_id":"...","usage":{...}}`
- **THEN** system emits a result event with the final text, session ID, and token usage, marking the turn as complete

#### Scenario: Receive permission request
- **WHEN** stdout produces `{"type":"control_request","request_id":"req_xxx","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{...}}}`
- **THEN** system emits a permission_request event with request_id, tool name, and input

#### Scenario: Receive permission cancel
- **WHEN** stdout produces `{"type":"control_cancel_request","request_id":"req_xxx"}`
- **THEN** system logs the cancellation and ignores the previously pending request

#### Scenario: Malformed JSON line
- **WHEN** stdout produces a line that is not valid JSON
- **THEN** system logs a warning and continues reading subsequent lines without crashing

### Requirement: Write messages to stdin
The system SHALL write JSON objects to the child process stdin, terminated by a newline character. All writes MUST be serialized (no concurrent writes) to prevent data corruption.

#### Scenario: Send user text message
- **WHEN** user submits a text prompt
- **THEN** system writes `{"type":"user","message":{"role":"user","content":"<text>"}}\n` to stdin

#### Scenario: Send permission allow response
- **WHEN** user approves a permission request
- **THEN** system writes a `control_response` JSON with `behavior: "allow"` and `updatedInput` containing the original tool input, matching the three-level nested structure

#### Scenario: Send permission deny response
- **WHEN** user denies a permission request
- **THEN** system writes a `control_response` JSON with `behavior: "deny"` and a reason message

### Requirement: Three-phase graceful shutdown
The system SHALL shut down the child process in three phases: (1) close stdin pipe and wait up to 120 seconds for Claude Code to execute Stop hooks and exit; (2) send SIGTERM and wait 5 seconds; (3) send SIGKILL and wait for process exit.

#### Scenario: Graceful exit via stdin close
- **WHEN** `close()` is called and Claude Code exits within 120 seconds of stdin close
- **THEN** process exits cleanly, no SIGTERM or SIGKILL is sent

#### Scenario: SIGTERM fallback
- **WHEN** Claude Code does not exit within 120 seconds of stdin close
- **THEN** system sends SIGTERM and waits up to 5 seconds

#### Scenario: SIGKILL force kill
- **WHEN** Claude Code does not exit within 5 seconds of SIGTERM
- **THEN** system sends SIGKILL to force terminate the process

### Requirement: Emit unified StreamEvent objects
The `StreamSession` class SHALL emit typed events via EventEmitter. Event types SHALL include: `text`, `tool_use`, `thinking`, `result`, `permission_request`, `error`, and `exit`.

#### Scenario: Session exits unexpectedly
- **WHEN** the child process exits with a non-zero code or is killed by signal
- **THEN** system emits an `exit` event with the exit code/signal and an `error` event if abnormal

### Requirement: Session metadata persistence
The system SHALL persist stream session metadata (Claude session ID, working directory, creation timestamp) to `data/config.json` under a `streamSessions` array key. On app restart, persisted sessions SHALL be available for resume.

#### Scenario: Save session metadata after init
- **WHEN** a `system` init event is received with a session_id
- **THEN** system persists `{claudeSessionId, cwd, createdAt}` to the streamSessions array

#### Scenario: Load sessions on startup
- **WHEN** the app starts
- **THEN** system reads persisted streamSessions and makes them available for listing and resumption
