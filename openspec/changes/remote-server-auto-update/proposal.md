## Why

`coding-bubble-remote-server.js` 首次部署到远程设备后，后续功能变更需要人工手动替换文件。随着迭代加速，每次发版都要求用户逐一更新每台远程设备上的脚本，运维成本高且容易遗漏，导致客户端与远程端版本不一致引发兼容性问题。

## What Changes

- 在构建时将版本号嵌入 `coding-bubble-remote-server.js`（通过 tsup `define` 注入），远程服务器在 `server_info` 消息中上报自身版本
- 在桌面客户端（Electron app）中内嵌一份跟随构建版本的 `coding-bubble-remote-server.js` 文件
- 扩展 WebSocket 协议，新增更新检测与文件传输消息类型
- 客户端连接远程服务器时自动比对版本，若客户端版本较新则通过 WebSocket 将新版脚本传输至远程端
- 远程服务器接收更新后，写入新文件并自动重启（spawn 新进程后退出旧进程）

## Capabilities

### New Capabilities
- `remote-server-versioning`: 远程服务器版本嵌入、上报与客户端侧版本比对检测
- `remote-server-update`: 通过 WebSocket 协议将新版 `coding-bubble-remote-server.js` 传输到远程设备并完成热替换重启

### Modified Capabilities
<!-- 无已有 spec 需要修改 -->

## Impact

- **packages/remote/src/shared/protocol.ts**: 新增版本字段（`ServerInfoMessage`）和更新相关消息类型
- **packages/remote/tsup.config.ts**: 注入版本号常量 `__REMOTE_SERVER_VERSION__`
- **packages/remote/src/server/server.ts**: `server_info` 消息携带版本号，新增更新消息处理逻辑
- **packages/remote/src/server/index.ts**: 新增更新接收、文件写入、自重启逻辑
- **packages/remote/src/client/remote-manager.ts**: 连接后检测版本差异，触发更新流程
- **apps/desktop**: 构建时将 `coding-bubble-remote-server.js` 复制为应用资源
- **.github/workflows/release.yml**: 无需变更（remote-server 仍独立构建发布）
