# Design: Python Hook Migration to Node.js/TypeScript

## Context

当前钩子系统使用 Python 脚本 `claude-bubble-state.py` 处理 Claude Code 钩子事件。该脚本负责：
1. 解析 JSON 输入的钩子事件
2. 通过 Unix socket 与本地 Node.js 服务器通信
3. 处理 PermissionRequest 事件并返回决策

Python 脚本位于 `packages/session-monitor/resources/` 目录，由 `hook-installer.ts` 管理安装。当前执行命令为 `python3 claude-bubble-state.py`。

## Goals / Non-Goals

**Goals:**
- 消除对 Python 运行时的依赖
- 保持与现有 socket 通信协议的完全兼容性
- 实现与 Python 版本相同的功能（所有钩子事件处理）
- 使用 TypeScript 重写以提高代码质量和维护性

**Non-Goals:**
- 修改钩子事件格式或 socket 通信协议
- 改变钩子安装或注册逻辑的流程
- 添加新的钩子事件类型或功能

## Decisions

### 1. 使用 Node.js + TypeScript 而非纯 JavaScript
**Rationale**: 项目已有完整的 TypeScript 配置和基础设施，使用 TypeScript 可以获得类型安全、更好的代码组织。

### 2. 保持脚本结构一致
**Rationale**: 最小化变化，确保行为完全一致。Node.js 版本将保持相同的事件处理流程和错误处理逻辑。

### 3. 使用 ts-node 或直接编译？
**决策**: 直接编译为 JavaScript 执行
**Rationale**: 
- 避免 ts-node 运行时依赖
- 生产环境中更简单，只有一个可执行文件
- 开发时可以编译后再测试

### 4. 修改 hook-installer.ts 中的命令路径
**决策**: 从 `python3 claude-bubble-state.py` 改为 `node claude-bubble-state.js`
**Rationale**: 简单直接，保持向后兼容。

### 5. 日志记录方式
**Rationale**: 保持与 Python 版本相同的日志文件 `/tmp/claude-bubble-hook.log`，便于调试和问题排查。

## Risks / Trade-offs

### [Risk] Node.js 版本可能遗漏某些 Python 特殊处理
**Mitigation**: 详细测试所有钩子事件类型，特别是 PermissionRequest 的超时处理。

### [Risk] 编译过程增加复杂度
**Mitigation**: 使用现有的构建工具，在 `package.json` 中添加编译脚本。

### [Trade-off] 日志格式可能略有不同
**权衡**: TypeScript 的 JSON 序列化与 Python 可能略有差异，但内容将保持一致。