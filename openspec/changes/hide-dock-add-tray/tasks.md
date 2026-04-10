## 1. 资源准备

- [ ] 1.1 创建托盘图标资源 `apps/desktop/resources/tray-iconTemplate.png`（22x22px 黑色模板图标）及 `tray-iconTemplate@2x.png`（44x44px）

## 2. 构建配置

- [ ] 2.1 在 `apps/desktop/package.json` 的 `build.mac` 中添加 `extendInfo: { LSUIElement: true }` 隐藏 Dock 图标

## 3. 主进程实现

- [ ] 3.1 在 `index.ts` 中引入 `Tray` 和 `nativeImage`，添加全局变量 `let tray: Tray | null = null`
- [ ] 3.2 提取共享菜单构建函数 `buildAppMenu(): Menu`，复用现有浮动球右键菜单逻辑（打开面板、设置、退出）
- [ ] 3.3 在 `app.whenReady()` 中创建 Tray 实例，设置模板图标和右键菜单
- [ ] 3.4 将现有浮动球 `contextmenu:show` IPC 改为调用 `buildAppMenu()` 共享菜单

## 4. 验证

- [ ] 4.1 macOS 启动后验证 Dock 无图标、菜单栏有托盘图标
- [ ] 4.2 验证托盘菜单三个选项（打开面板、设置、退出）功能正常
- [ ] 4.3 验证浮动球右键菜单功能未受影响
- [ ] 4.4 验证浅色/深色模式下托盘图标可见性
