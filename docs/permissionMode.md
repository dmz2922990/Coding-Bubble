主公明鉴！调查结果如下：

## 一、Hook 方式获取权限模式

**所有 hook 的输入都包含 `permission_mode` 字段。** 这是通过 `createBaseHookInput()` 统一注入的（`src/utils/hooks.ts:301-328`）。

每个 hook 收到的 JSON 输入中都会包含：

```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "permission_mode": "default",   // <-- 当前权限模式
  "agent_id": "...",
  "agent_type": "..."
}
```

权限模式的值来源于 `appState.toolPermissionContext.mode`（如 `src/query/stopHooks.ts:178`、`src/query.ts:571` 等）。

## 二、JSON-stream 模式获取权限模式

有 **两个系统消息** 携带 `permissionMode` 字段：

### 1. `init` 消息 — 会话初始化时

```json
{
  "type": "system",
  "subtype": "init",
  "permissionMode": "default",   // <-- 必填字段
  "model": "claude-sonnet-4-6",
  "tools": [...],
  "cwd": "...",
  ...
}
```

定义在 `src/entrypoints/sdk/coreSchemas.ts:1457-1474`，`permissionMode` 是**必填**字段。

### 2. `status` 消息 — 状态变化时

```json
{
  "type": "system",
  "subtype": "status",
  "status": "ready",
  "permissionMode": "default",   // <-- 可选字段
  ...
}
```

定义在 `src/entrypoints/sdk/coreSchemas.ts:1533-1542`，`permissionMode` 是**可选**字段。

### 3. 控制指令 — 可动态切换权限模式

SDK 宿主可以通过发送控制消息来切换权限模式：

```json
{
  "subtype": "set_permission_mode",
  "mode": "acceptEdits"
}
```

定义在 `src/entrypoints/sdk/controlSchemas.ts:124-135`。

主公明鉴！调查结果如下：

## 权限模式 → Theme Color Key 映射

定义在 `src/utils/permissions/PermissionMode.ts:42-91`：

| 权限模式            | Color Key    | 符号 | 标题               |
| ------------------- | ------------ | ---- | ------------------ |
| `default`           | `text`       | (无) | Default            |
| `plan`              | `planMode`   | ⏸    | Plan Mode          |
| `acceptEdits`       | `autoAccept` | ⏵⏵   | Accept edits       |
| `bypassPermissions` | `error`      | ⏵⏵   | Bypass Permissions |
| `dontAsk`           | `error`      | ⏵⏵   | Don't Ask          |
| `auto`              | `warning`    | ⏵⏵   | Auto mode          |

## 各 Theme Color Key 在不同主题下的色号

定义在 `src/utils/theme.ts`：

| Color Key                  | Dark 主题                  | Light 主题               | Dark Daltonized         | Light Daltonized         | ANSI Dark            | ANSI Light     |
| -------------------------- | -------------------------- | ------------------------ | ----------------------- | ------------------------ | -------------------- | -------------- |
| `text` (default)           | `rgb(255,255,255)` 白      | `rgb(0,0,0)` 黑          | `rgb(255,255,255)` 白   | `rgb(0,0,0)` 黑          | `ansi:white`         | `ansi:black`   |
| `planMode` (plan)          | `rgb(72,150,140)` 鼠尾草绿 | `rgb(0,102,102)` 暗青    | `rgb(102,153,153)` 灰青 | `rgb(0,102,102)` 暗青    | `ansi:cyanBright`    | `ansi:cyan`    |
| `autoAccept` (acceptEdits) | `rgb(175,135,255)` 电紫    | `rgb(135,0,255)` 电紫    | `rgb(175,135,255)` 电紫 | `rgb(135,0,255)` 电紫    | `ansi:magentaBright` | `ansi:magenta` |
| `error` (bypass/dontAsk)   | `rgb(255,107,128)` 亮红    | `rgb(204,51,51)` 红      | `rgb(255,102,102)` 亮红 | `rgb(204,51,51)` 红      | `ansi:redBright`     | `ansi:red`     |
| `warning` (auto)           | `rgb(255,193,7)` 琥珀      | `rgb(184,147,63)` 暗琥珀 | `rgb(255,204,0)` 黄橙   | `rgb(184,147,63)` 暗琥珀 | `ansi:yellowBright`  | `ansi:yellow`  |

## 简明总结

```
default      → 白色/黑色（跟随主题文本色）
plan         → 绿色系（鼠尾草绿 / 暗青）
acceptEdits  → 紫色（电紫 #AF87FF / #8700FF）
bypassPerms  → 红色（亮红）
dontAsk      → 红色（亮红，与 bypass 相同）
auto         → 黄色/琥珀色
```

主公若需进一步了解某个主题的完整色板，请随时示下！

## 总结

| 方式 | 字段名 | 必填/可选 | 何时可用 |
|------|--------|----------|---------|
| Hook 输入 | `permission_mode` | 可选 | 每个 hook 事件触发时 |
| JSON-stream `init` | `permissionMode` | **必填** | 会话启动时 |
| JSON-stream `status` | `permissionMode` | 可选 | 状态变更时 |

主公若需在 hook 脚本中获取权限模式，直接从 stdin 读取 JSON 中的 `permission_mode` 字段即可。