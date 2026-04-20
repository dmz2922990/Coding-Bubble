## ADDED Requirements

### Requirement: Update offer protocol message
The client SHALL send an `update_offer` message to the remote server when a version mismatch is detected, containing the new version, total file size, and SHA-256 checksum.

#### Scenario: Client sends update offer
- **WHEN** the client detects that its bundled version is newer than the remote server's version
- **THEN** the client SHALL send an `update_offer` message with fields `version`, `size`, and `checksum`

### Requirement: Remote server accepts or rejects update
The remote server SHALL respond to `update_offer` with `update_accept` or `update_reject`.

#### Scenario: Server accepts update
- **WHEN** the remote server receives a valid `update_offer` with a newer version
- **THEN** the server SHALL respond with `update_accept` and prepare to receive file chunks

#### Scenario: Server rejects update during active sessions
- **WHEN** the remote server has active Claude Code sessions (hook or stream) running
- **THEN** the server SHALL respond with `update_reject` with reason `"active_sessions"`

### Requirement: Chunked file transfer
The client SHALL transfer the new remote server file in binary chunks through the WebSocket connection after the server accepts the update offer.

#### Scenario: File transfer in chunks
- **WHEN** the server accepts the update offer
- **THEN** the client SHALL send the file content in `update_chunk` messages, each containing a `sequence` number and binary `data`
- **AND** the chunk size SHALL NOT exceed 64KB

#### Scenario: Transfer completion
- **WHEN** all chunks have been sent
- **THEN** the client SHALL send an `update_complete` message

### Requirement: Remote server validates received file
The remote server SHALL validate the received file integrity using the checksum from the update offer before applying the update.

#### Scenario: Checksum validation succeeds
- **WHEN** all chunks are received and the SHA-256 checksum matches
- **THEN** the server SHALL proceed to apply the update

#### Scenario: Checksum validation fails
- **WHEN** all chunks are received but the SHA-256 checksum does not match
- **THEN** the server SHALL delete the temporary file and send `update_result` with `success: false` and reason `"checksum_mismatch"`

### Requirement: Atomic file replacement and restart
The remote server SHALL atomically replace the running script file and restart itself.

#### Scenario: Successful update and restart
- **WHEN** the received file passes checksum validation
- **THEN** the server SHALL write the file to `<script_path>.tmp`
- **AND** rename `<script_path>.tmp` to `<script_path>` (atomic replacement)
- **AND** spawn a new Node.js process with the same arguments (`--port`, `--token`)
- **AND** the new process SHALL start listening on the same port
- **AND** the old process SHALL send `update_result` with `success: true` then gracefully exit

#### Scenario: Restart preserves configuration
- **WHEN** the new process starts
- **THEN** it SHALL use the same `--port` and `--token` arguments as the old process

### Requirement: Client reconnects after update
The client SHALL automatically reconnect to the remote server after detecting disconnection during an update.

#### Scenario: Client reconnects to updated server
- **WHEN** the client detects the WebSocket connection closed during an update
- **THEN** the client SHALL use its existing reconnection mechanism to reconnect
- **AND** upon receiving `server_info` from the reconnected server, verify the version now matches
