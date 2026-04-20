## ADDED Requirements

### Requirement: Version embedding in remote server bundle
The build system SHALL inject the current package version as a constant `__REMOTE_SERVER_VERSION__` into the remote server bundle at build time via tsup `define`.

#### Scenario: Version is available at runtime
- **WHEN** the remote server bundle is built via tsup
- **THEN** the constant `__REMOTE_SERVER_VERSION__` SHALL be available as a string matching the version in `packages/remote/package.json`

### Requirement: Server reports version in server_info message
The remote server SHALL include its version in the `server_info` message sent to clients after authentication.

#### Scenario: Version included in server_info after auth
- **WHEN** a client successfully authenticates with the remote server
- **THEN** the server SHALL send a `server_info` message containing a `version` field with the value of `__REMOTE_SERVER_VERSION__`

### Requirement: Client embeds remote server bundle as resource
The desktop app SHALL bundle a copy of `coding-bubble-remote-server.js` as an application resource that matches the current build version.

#### Scenario: Bundled file matches build version
- **WHEN** the desktop app is built
- **THEN** a copy of `coding-bubble-remote-server.js` SHALL be included in the app's resources directory
- **AND** the bundled file SHALL be the same version as the app itself

### Requirement: Client detects version mismatch on connection
The client SHALL compare its bundled remote server version against the remote server's reported version after establishing a connection.

#### Scenario: Remote server version is older
- **WHEN** the client connects to a remote server and receives `server_info` with a version older than the bundled version
- **THEN** the client SHALL initiate the update process

#### Scenario: Remote server version matches or is newer
- **WHEN** the client connects to a remote server and receives `server_info` with a version equal to or newer than the bundled version
- **THEN** the client SHALL NOT initiate the update process and proceed normally

#### Scenario: Remote server does not report version (legacy)
- **WHEN** the client connects to a remote server that does not include a `version` field in `server_info`
- **THEN** the client SHALL treat it as version `"0.0.0"` and initiate the update process
