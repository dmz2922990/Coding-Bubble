## Why

Claude Code 的 Stream/Stdio 协议（NDJSON）未暴露历史输入相关的消息类型，外部接入的客户端无法通过协议获取历史输入记录。为实现 ↑/↓ 键导航历史输入的功能，客户端需要在本地维护历史输入状态，提供类 Shell 的历史翻阅体验。

## What Changes

- 新增 `InputHistory` 类，提供历史输入的本地存储和导航功能
- 支持 ↑ 键向前翻阅（更早的记录）
- 支持 ↓ 键向后翻阅（更新的记录）
- 支持草稿保存：首次按 ↑ 时保存当前未提交输入，按 ↓ 回到底部时恢复
- 支持持久化存储（可选）：客户端重启后保留历史记录
- 历史条目上限 100 条，防止内存无限增长

## Capabilities

### New Capabilities

- `input-history-local-storage`: 本地维护输入历史的数据结构和 API，支持添加、导航、重置操作
- `input-history-persistence`: 可选的持久化存储能力，将历史记录写入本地文件

### Modified Capabilities

- 无

## Impact

- 新增客户端代码，不修改 Claude Code Stream 协议
- 与现有代码无冲突，纯客户端功能增强
- 依赖文件系统 API（仅当启用持久化时）
