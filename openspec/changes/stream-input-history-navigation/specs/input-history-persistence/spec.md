## ADDED Requirements

### Requirement: PersistentInputHistory SHALL load history from file
The PersistentInputHistory class SHALL load existing history entries from a local file on initialization.

#### Scenario: Load existing history file
- **GIVEN** a history file exists with valid JSONL entries
- **WHEN** load is called
- **THEN** entries SHALL be parsed and loaded into memory
- **AND** entries SHALL be sorted by timestamp (newest first)
- **AND** only the most recent 100 entries SHALL be kept

#### Scenario: Handle missing history file
- **GIVEN** no history file exists
- **WHEN** load is called
- **THEN** no error SHALL be thrown
- **AND** entries SHALL remain empty

#### Scenario: Handle corrupted history file
- **GIVEN** a history file exists with invalid JSON
- **WHEN** load is called
- **THEN** the invalid line SHALL be skipped
- **AND** valid entries SHALL still be loaded

### Requirement: PersistentInputHistory SHALL append new entries to file
The PersistentInputHistory class SHALL append new entries to the history file asynchronously.

#### Scenario: Add entry triggers persistence
- **GIVEN** PersistentInputHistory is initialized with file path
- **WHEN** add is called with input "test command"
- **THEN** the entry SHALL be appended to the history file as JSONL
- **AND** the write SHALL be asynchronous (non-blocking)

#### Scenario: File format is JSONL
- **GIVEN** a new entry with display="test" and timestamp=1234567890
- **WHEN** the entry is persisted
- **THEN** the file SHALL contain a line: {"display":"test","timestamp":1234567890}

### Requirement: PersistentInputHistory SHALL use configurable file path
The PersistentInputHistory class SHALL accept a file path for history storage.

#### Scenario: Custom history file path
- **GIVEN** a file path "/custom/path/history.jsonl"
- **WHEN** PersistentInputHistory is initialized
- **THEN** the file path SHALL be stored for subsequent operations
