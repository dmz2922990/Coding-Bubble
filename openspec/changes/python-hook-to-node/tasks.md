# Tasks: Python Hook Migration to Node.js/TypeScript

## 1. 创建 Node.js 钩子脚本

- [x] 1.1 创建 `claude-bubble-state.ts` 文件，复制 Python 脚本的核心功能
- [x] 1.2 实现标准输入读取和 JSON 解析功能
- [x] 1.3 实现 Unix socket 通信逻辑
- [x] 1.4 实现 PermissionRequest 事件的响应处理
- [x] 1.5 实现日志记录功能到 `/tmp/claude-bubble-hook.log`
- [x] 1.6 添加环境变量 `CLAUDE_BUBBLE_SKIP_HOOK` 支持

## 2. 更新 hook-installer.ts

- [x] 2.1 更新 `loadHookScript()` 函数以支持 TypeScript 文件
- [x] 2.2 修改安装逻辑以编译 TypeScript 为 JavaScript
- [x] 2.3 更新钩子命令从 `python3` 到 `node`
- [x] 2.4 确保安装的脚本具有正确的可执行权限

## 3. 添加编译支持

- [x] 3.1 在 `packages/session-monitor/package.json` 中添加编译脚本
- [x] 3.2 配置 TypeScript 编置选项以生成 CommonJS 模块
- [x] 3.3 添加开发模式下的文件监听和自动编译

## 4. 测试验证

- [x] 4.1 测试所有钩子事件类型的正常处理
- [ ] 4.2 测试 PermissionRequest 事件的生命周期
- [ ] 4.3 测试 socket 通信的可靠性
- [ ] 4.4 测试错误处理和日志记录
- [ ] 4.5 验证与 Python 版本的行为一致性

## 5. 更新文档

- [ ] 5.1 更新 README 或相关文档说明 Node.js 版本的依赖要求
- [ ] 5.2 添加迁移指南（如果需要）
- [ ] 5.3 清理旧的 Python 脚本文件（在确认迁移完成后）