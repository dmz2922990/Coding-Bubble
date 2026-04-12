## ADDED Requirements

### Requirement: InputHistory SHALL store user input entries
The InputHistory class SHALL maintain a list of history entries with display text and timestamp.

#### Scenario: Add non-empty input
- **WHEN** user submits input "hello world"
- **THEN** the entry SHALL be stored with display="hello world" and current timestamp
- **AND** the entry SHALL be inserted at the beginning of the list

#### Scenario: Ignore empty input
- **WHEN** user submits input "   " (only whitespace)
- **THEN** the entry SHALL NOT be stored

### Requirement: InputHistory SHALL support maximum entry limit
The InputHistory class SHALL enforce a maximum of 100 entries and remove oldest when exceeded.

#### Scenario: Exceed max items
- **GIVEN** InputHistory contains 100 entries
- **WHEN** user adds a new entry
- **THEN** the oldest entry SHALL be removed
- **AND** the new entry SHALL be at index 0

### Requirement: InputHistory SHALL support navigation with history index
The InputHistory class SHALL maintain a navigation index starting at -1 (not navigating).

#### Scenario: Navigate up from initial state
- **GIVEN** history contains ["entry1", "entry2", "entry3"] (entry1 is newest)
- **AND** historyIndex is -1
- **WHEN** navigateUp is called with currentInput="draft"
- **THEN** currentInput SHALL be saved as draft
- **AND** historyIndex SHALL become 0
- **AND** the method SHALL return "entry1"

#### Scenario: Navigate up multiple times
- **GIVEN** history contains ["entry1", "entry2", "entry3"]
- **AND** historyIndex is 0
- **WHEN** navigateUp is called
- **THEN** historyIndex SHALL become 1
- **AND** the method SHALL return "entry2"

#### Scenario: Navigate up at earliest entry
- **GIVEN** history contains ["entry1", "entry2"]
- **AND** historyIndex is 1 (at earliest entry)
- **WHEN** navigateUp is called
- **THEN** the method SHALL return null (no more history)

#### Scenario: Navigate down from history
- **GIVEN** history contains ["entry1", "entry2"]
- **AND** historyIndex is 1
- **WHEN** navigateDown is called
- **THEN** historyIndex SHALL become 0
- **AND** the method SHALL return "entry1"

#### Scenario: Navigate down to restore draft
- **GIVEN** history contains ["entry1"]
- **AND** historyIndex is 0
- **AND** draft was saved as "my draft"
- **WHEN** navigateDown is called
- **THEN** historyIndex SHALL become -1
- **AND** the method SHALL return "my draft"

#### Scenario: Navigate down without draft
- **GIVEN** history contains ["entry1"]
- **AND** historyIndex is 0
- **AND** no draft was saved
- **WHEN** navigateDown is called
- **THEN** historyIndex SHALL become -1
- **AND** the method SHALL return empty string

### Requirement: InputHistory SHALL reset navigation state on submission
The InputHistory class SHALL reset historyIndex to -1 after user submits input.

#### Scenario: Submit after navigation
- **GIVEN** historyIndex is 2 (navigating history)
- **WHEN** add is called with new input
- **THEN** historyIndex SHALL be reset to -1
- **AND** draftSaved SHALL be set to false

### Requirement: InputHistory SHALL provide reset method
The InputHistory class SHALL provide a reset method to cancel navigation.

#### Scenario: Cancel navigation
- **GIVEN** historyIndex is 2
- **AND** draftSaved is true
- **WHEN** reset is called
- **THEN** historyIndex SHALL become -1
- **AND** draftSaved SHALL become false
