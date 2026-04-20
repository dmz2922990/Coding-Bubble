## Context

Coding-bubble 的远程服务器 `coding-bubble-remote-server.js` 是一个通过 tsup 打包的单文件 Node.js CJS bundle，运行在远程设备上。客户端（Electron 桌面应用）通过 WebSocket 连接远程服务器，使用自定义协议（`packages/remote/src/shared/protocol.ts`）进行通信。

当前状态：
- 远程服务器不报告版本号（`ServerInfoMessage` 仅含 hostname/platform/pid）
- 无更新检测与推送机制，每次迭代需用户手动替换远程设备上的文件
- 客户端已具备断线自动重连能力（`RemoteManager` 指数退避重连）

约束：
- 远程服务器可能运行在 Linux/macOS/Windows 上
- 远程设备可能有防火墙限制，无法从远程端主动拉取文件
- 更新过程必须对正在进行的 Claude Code 会话影响最小

## Goals / Non-Goals

**Goals:**
- 客户端内嵌跟随版本的远程服务器文件，连接时自动检测版本差异
- 通过已有 WebSocket 连接将新版脚本推送至远程端
- 远程服务器接收更新后自动热替换并重启，客户端透明重连

**Non-Goals:**
- 不实现远程端的 cron 定时检查或主动拉取更新
- 不实现回滚机制（用户可通过 GitHub Release 重新下载旧版本手动部署）
- 不支持增量更新（每次传输完整文件）

## Decisions

### D1: 版本号嵌入方式 — tsup define 注入

**选择：** 通过 tsup `define` 将 `package.json` 的 version 字段注入为 `__REMOTE_SERVER_VERSION__` 常量

**理由：** 与现有 `__HOOK_SCRIPT__` 注入方式一致，零运行时开销，构建时确定

**备选方案：** 在运行时 `require('./package.json')` — 需要额外打包 package.json 到 bundle 中，增加复杂性

### D2: 文件传输方式 — WebSocket 二进制分块传输

**选择：** 通过 WebSocket 二进制帧分块传输完整文件内容，使用 checksum 校验

**理由：**
- 复用已有 WebSocket 连接，无需额外网络通道
- 二进制传输效率高于 base64 编码
- 分块传输可控制内存占用，适合 170KB+ 的文件

**传输协议：**
1. Client → Server: `update_offer`（携带版本号、文件大小、checksum）
2. Server → Client: `update_accept`（同意接收）
3. Client → Server: `update_chunk`（多次，二进制分块，携带序号）
4. Client → Server: `update_complete`（传输完成信号）
5. Server → Client: `update_result`（校验结果，成功/失败）

**备选方案：** 一次性发送完整文件（简单但大文件时内存占用高，无断点续传能力）

### D3: 热替换策略 — spawn 新进程 + graceful exit

**选择：** 远程服务器接收新文件后：
1. 写入临时文件 `coding-bubble-remote-server.js.tmp`
2. rename 替换原文件（原子操作）
3. 使用 `child_process.spawn` 启动新进程（继承 `--port`、`--token` 等参数）
4. 新进程成功启动后旧进程 graceful exit

**理由：**
- 确保文件替换的原子性（rename 是原子操作）
- spawn 后旧进程退出，端口释放后新进程接管
- 与现有的 graceful shutdown 逻辑兼容

**备选方案：** 使用 `process.execPath + process.argv` 重启 — 会丢失 `--port`/`--token` 参数，需要额外处理

### D4: 客户端内嵌方式 — Electron extraResources

**选择：** 将 `coding-bubble-remote-server.js` 作为 Electron 的 `extraResources` 打包进应用

**理由：**
- 构建时自动复制，与应用版本强绑定
- 运行时通过 `process.resourcesPath` 可靠访问
- 跨平台一致

### D5: 版本比较策略 — 语义化版本字符串比较

**选择：** 使用 semver 字符串比较（major.minor.patch），客户端版本 > 服务器版本时触发更新

**理由：** 简单可靠，与项目现有的 `0.1.7` 版本格式一致

## Risks / Trade-offs

- **[更新过程中连接中断]** → 临时文件写入后如果旧进程在 spawn 前崩溃，远程端处于无服务状态。缓解：rename 是原子操作，即使崩溃旧文件仍然完整
- **[大文件传输占用带宽]** → 170KB 的文件分块传输影响可忽略，但如果未来 bundle 体积增长需要考虑压缩。当前阶段暂不压缩
- **[Windows 文件锁定]** → `.js` 文件不会被 Windows 锁定（不同于 .exe），rename 替换在所有平台上可行
- **[并发更新]** → 多个客户端同时连接时只有一个能连接（已有限制），不会出现并发更新冲突
