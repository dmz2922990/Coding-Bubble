# Specification: Hook Installation

## ADDED Requirements

### Requirement: Node.js 脚本安装
钩子安装器 SHALL 支持安装 Node.js 版本的钩子脚本到 Claude 配置目录。

#### Scenario: 脚本文件复制
- **WHEN** 安装钩子时
- **THEN** 系统从 `packages/session-monitor/resources/claude-bubble-state.ts` 复制脚本文件
- **AND** 编译 TypeScript 为 JavaScript 输出到 `~/.claude/hooks/claude-bubble-state.js`
- **AND** 设置脚本可执行权限 (755)

### Requirement: 钩子命令更新
钩子安装器 SHALL 更新钩子命令以使用 Node.js 而非 Python。

#### Scenario: 命令路径更新
- **WHEN** 为每个钩子事件安装钩子
- **THEN** 命令从 `python3 claude-bubble-state.py` 改为 `node claude-bubble-state.js`
- **AND** 保持命令的其他参数和结构不变

### Requirement: 脚本加载逻辑
钩子安装器 SHALL 更新脚本加载逻辑以支持 TypeScript。

#### Scenario: 开发环境脚本加载
- **WHEN** 在开发环境中加载钩子脚本
- **THEN** 系统首先查找 TypeScript 源文件
- **AND** 如果找到 TypeScript 文件，自动编译为 JavaScript 后使用

#### Scenario: 生产环境脚本加载
- **WHEN** 在生产环境中加载钩子脚本
- **THEN** 系统直接使用预编译的 JavaScript 文件
- **AND** 支持预编译的 JavaScript 文件在资源目录中

### Requirement: 脚本编译配置
项目 SHALL 支持钩子脚本的 TypeScript 编译。

#### Scenario: 编译脚本命令
- **WHEN** 开发者运行编译命令
- **THEN** TypeScript 文件编译为 JavaScript
- **AND** 生成与源文件同名的 .js 文件
- **AND** 保持相同的文件权限和位置

#### Scenario: 监听模式编译
- **WHEN** 在开发模式下修改钩子脚本
- **THEN** 监听文件变化并自动重新编译
- **AND** 确保最新的脚本被使用