## Why

Stream 模式的输入框当前是纯文本 textarea，用户无法得知当前会话支持哪些 skill 和 slash command。必须手动记忆并输入完整的 `/skill-name`，体验割裂且容易出错。`system/init` 消息已包含 `skills` 和 `slash_commands` 列表，但目前被 `StreamSession` 完全丢弃。需要捕获这些数据并在输入框中提供实时搜索建议。

## What Changes

- 从 `system/init` 消息中提取 `skills`、`slash_commands` 等 init 元数据，作为新事件向上层传递
- 在 `MessageInput` 组件中检测 `/` 前缀输入，弹出可过滤的 skill/slash-command 建议列表
- 支持键盘导航（上下箭头选择、Enter 确认、Escape 关闭）和模糊匹配过滤
- 选中建议项后自动将 `/command` 插入输入框

## Capabilities

### New Capabilities

- `stream-init-metadata`: 捕获并传递 `system/init` 消息中的会话元数据（skills、slash_commands、tools、model 等），使其可被 UI 层消费
- `input-skill-suggest`: 在 stream 模式输入框中，当用户输入 `/` 时实时显示可过滤的 skill/slash-command 建议弹出列表，支持键盘导航和自动插入

### Modified Capabilities

_(无需修改现有 capability 规格)_

## Impact

- **packages/stream-json**: `StreamSession._handleSystem()` 需新增 `session_init` 事件类型及对应类型定义
- **apps/desktop/src/main/stream-adapter.ts**: 需处理新事件，将 init 元数据传递给渲染进程
- **apps/desktop/src/preload/index.ts**: 可能需要新增 IPC 通道传递 skill 列表
- **apps/desktop/src/renderer/components/ChatPanel/MessageInput.tsx**: 核心变更——从 textarea 升级为支持建议列表的输入组件
- **apps/desktop/src/renderer/components/ChatPanel/styles.css**: 新增建议列表的样式
- **apps/desktop/src/renderer/components/ChatPanel/index.tsx**: 将 skill 列表数据传递给 MessageInput
