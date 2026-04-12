## ADDED Requirements

### Requirement: MessageInput SHALL show suggestion list when user types slash

当用户在输入框中输入 `/` 作为文本开头时（或光标前一个字符为空格且当前输入为 `/`），MessageInput SHALL 显示一个建议弹出列表，包含所有可用的 skills 和 slash_commands。

#### Scenario: Typing slash at beginning of input

- **WHEN** 用户在空输入框中输入 `/`
- **THEN** 输入框上方 SHALL 显示建议列表，列出所有 skills 和 slash_commands，每项以 `/` 前缀展示

#### Scenario: Slash not at trigger position

- **WHEN** 用户输入 `hello /`（`/` 不在文本开头或空格后）
- **THEN** 建议列表 SHALL NOT 显示

### Requirement: Suggestion list SHALL filter by prefix match

建议列表 SHALL 根据用户在 `/` 之后输入的文本进行前缀过滤（不区分大小写）。

#### Scenario: Prefix filtering

- **WHEN** 可用 skills 为 `["commit","commit-push-pr","simplify","han-jira-analysis"]` 且用户输入 `/com`
- **THEN** 建议列表 SHALL 仅显示 `/commit` 和 `/commit-push-pr`

#### Scenario: No matches

- **WHEN** 用户输入 `/xyz` 且无匹配的 skill/slash_command
- **THEN** 建议列表 SHALL NOT 显示

### Requirement: Suggestion list SHALL support keyboard navigation

用户 SHALL 可以使用键盘在建议列表中导航和选择。

#### Scenario: Arrow down selects next item

- **WHEN** 建议列表可见且用户按 `ArrowDown`
- **THEN** 当前高亮项 SHALL 向下移动一位；已在最后一项时循环到第一项

#### Scenario: Arrow up selects previous item

- **WHEN** 建议列表可见且用户按 `ArrowUp`
- **THEN** 当前高亮项 SHALL 向上移动一位；已在第一项时循环到最后一项

#### Scenario: Enter confirms selection

- **WHEN** 建议列表可见且有高亮项，用户按 `Enter`
- **THEN** 输入框文本 SHALL 替换为选中的 `/command`，建议列表 SHALL 关闭，光标保持在输入框中

#### Scenario: Escape dismisses list

- **WHEN** 建议列表可见且用户按 `Escape`
- **THEN** 建议列表 SHALL 关闭，输入框文本保持不变

### Requirement: Suggestion list SHALL support mouse click selection

用户 SHALL 可以通过鼠标点击选择建议项。

#### Scenario: Click on suggestion item

- **WHEN** 建议列表可见且用户点击某一项
- **THEN** 输入框文本 SHALL 替换为点击的 `/command`，建议列表 SHALL 关闭

### Requirement: Suggestion list SHALL have maximum display limit

建议列表 SHALL 最多显示 8 条建议。超出时列表 SHALL 可滚动。

#### Scenario: More than 8 matches available

- **WHEN** 匹配的 skill/slash_command 数量超过 8 条
- **THEN** 建议列表 SHALL 仅显示前 8 条，列表区域可滚动

### Requirement: Suggestion list SHALL dismiss when trigger condition clears

当输入文本不再满足触发条件时，建议列表 SHALL 自动关闭。

#### Scenario: User deletes the slash

- **WHEN** 建议列表可见且用户删除 `/` 字符
- **THEN** 建议列表 SHALL 关闭

#### Scenario: User moves cursor away from command area

- **WHEN** 建议列表可见且用户将光标移动到 `/command` 之前的位置
- **THEN** 建议列表 SHALL 关闭

### Requirement: MessageInput SHALL receive skills via props

`MessageInput` 组件 SHALL 接受 `skills`（string[]）和 `slashCommands`（string[]）props，用于构建建议列表。

#### Scenario: Skills passed as props

- **WHEN** ChatPanel 渲染 MessageInput 并传入 `skills={["commit","simplify"]}` 和 `slashCommands={["/commit","/simplify"]}`
- **THEN** MessageInput SHALL 合并去重两项列表作为建议数据源
