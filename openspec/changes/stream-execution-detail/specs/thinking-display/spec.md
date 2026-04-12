## ADDED Requirements

### Requirement: Create thinking ChatItem from thinking events
StreamAdapterManager SHALL create a `thinking` ChatItem when receiving a `thinking` event from StreamSession.

#### Scenario: Thinking content received
- **WHEN** StreamSession emits a `thinking` event with content text
- **THEN** StreamAdapterManager SHALL create a ChatItem of type `thinking` with the content text

### Requirement: Thinking ChatItem rendered as collapsible block
The Renderer SHALL render `thinking` ChatItems using the existing ThinkingItem component with truncated preview and expand/collapse toggle.

#### Scenario: Short thinking content
- **WHEN** a thinking ChatItem has content shorter than 80 characters
- **THEN** the full content SHALL be displayed inline

#### Scenario: Long thinking content
- **WHEN** a thinking ChatItem has content longer than 80 characters
- **THEN** the first 80 characters SHALL be shown with "..." and clicking SHALL expand to full content
