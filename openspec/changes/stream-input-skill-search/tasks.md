## 1. Stream-JSON 类型扩展

- [x] 1.1 在 `packages/stream-json/src/types.ts` 中 `StreamEventType` 联合类型添加 `'session_init'`
- [x] 1.2 在 `StreamEvent` 接口中添加 `initMetadata?: { skills: string[]; slashCommands: string[] }` 字段

## 2. StreamSession 事件发射

- [x] 2.1 修改 `packages/stream-json/src/stream-session.ts` 的 `_handleSystem()` 方法，在 `init` 分支中提取 `skills` 和 `slash_commands` 字段并 emit `session_init` 事件

## 3. SessionStore 元数据存储

- [x] 3.1 在 `packages/session-monitor/src/types.ts` 中扩展会话状态类型，添加 `initMetadata` 字段
- [x] 3.2 修改 `packages/session-monitor/src/session-store.ts`，支持存储和读取 `initMetadata`

## 4. StreamAdapter 事件转发

- [x] 4.1 修改 `apps/desktop/src/main/stream-adapter.ts` 的 `_handleEvent()`，处理 `session_init` 事件，将元数据存入 SessionStore 并通过 `session:update` 广播给渲染进程

## 5. 渲染进程数据消费

- [x] 5.1 修改 `apps/desktop/src/renderer/components/ChatPanel/index.tsx` 的 `onUpdate` 回调，从 `session:update` payload 中提取 `initMetadata`
- [x] 5.2 将 `skills` 和 `slashCommands` 作为 props 传递给 `MessageInput` 组件

## 6. MessageInput 建议列表 UI

- [x] 6.1 扩展 `MessageInput` 组件 props，添加 `skills: string[]` 和 `slashCommands: string[]`
- [x] 6.2 实现输入检测逻辑：当文本以 `/` 开头（或光标位于 `/command` 区域）时触发建议列表
- [x] 6.3 实现前缀过滤逻辑，根据 `/` 后的输入文本不区分大小写过滤建议项
- [x] 6.4 实现键盘导航：ArrowUp/ArrowDown 循环高亮、Enter 确认选中、Escape 关闭列表
- [x] 6.5 实现鼠标点击选择
- [x] 6.6 实现自动关闭：删除 `/` 或光标移出触发区域时关闭列表

## 7. 样式

- [x] 7.1 在 `apps/desktop/src/renderer/components/ChatPanel/styles.css` 中添加建议列表样式（absolute 定位、最大高度 8 项、滚动、高亮项背景色）

## 8. 验证

- [x] 8.1 TypeScript 编译通过（`pnpm -C apps/desktop build`）
- [ ] 8.2 启动应用，创建 stream session，验证输入 `/` 时显示建议列表
- [ ] 8.3 验证键盘导航和鼠标点击选择功能
