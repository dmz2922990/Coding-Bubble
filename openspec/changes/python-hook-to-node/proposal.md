# Proposal: Python Hook Migration to Node.js/TypeScript

## Why

Python 钩子脚本存在依赖问题：目标机可能没有安装 Python，导致钩子无法执行。迁移到 Node.js/TypeScript 可以消除外部依赖，提高跨平台兼容性，并利用现有的 TypeScript 代码库基础设施。

## What Changes

- 将 `packages/session-monitor/resources/claude-bubble-state.py` 迁移到 TypeScript
- 创建 `packages/session-monitor/resources/claude-bubble-state.ts` 作为新的钩子脚本
- 修改 `packages/session-monitor/src/hook-installer.ts` 中的脚本加载逻辑和执行命令
- 确保 Node.js 脚本保持与 Python 版本相同的功能和 API 兼容性

## Capabilities

### New Capabilities
- node-hook-script: 实现 Node.js 版本的钩子脚本，支持所有现有的钩子事件类型
- hook-command-executor: 使用 Node.js 替代 Python 执行钩子命令

### Modified Capabilities
- hook-installation: 更新钩子安装逻辑以使用 Node.js 脚本而非 Python 脚本

## Impact

- **Affected code**: `packages/session-monitor/src/hook-installer.ts`, `packages/session-monitor/resources/`
- **Dependencies**: 移除对 Python 运行时的依赖
- **API**: 保持与现有 socket 服务器和事件系统的兼容性