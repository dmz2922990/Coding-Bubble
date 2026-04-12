# Stream 模式获取 Skill 列表 — `system/init` 消息详解

## 概述

在 Claude Code 的 stream-json 模式下，CLI 进程启动后会自动输出一条 `system/init` 消息作为流的第一条消息。该消息包含当前会话的完整元数据，其中 `skills` 字段即为可用的 skill 名称列表。

## 启用 Stream 模式

```bash
claude --output-format stream-json
# 或通过 --sdk-url 自动启用
claude --sdk-url http://localhost:port
```

## 消息结构

`system/init` 消息以 NDJSON 格式输出到 stdout，完整字段如下：

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "string",
  "uuid": "string",
  "cwd": "string",
  "model": "string",
  "claude_code_version": "string",
  "permissionMode": "default | acceptEdits | bypassPermissions | plan | dontAsk",
  "apiKeySource": "user | project | org | temporary | oauth",
  "tools": ["string"],
  "mcp_servers": [{ "name": "string", "status": "string" }],
  "slash_commands": ["string"],
  "skills": ["string"],
  "agents": ["string"],
  "plugins": [{ "name": "string", "path": "string", "source": "string" }],
  "betas": ["string"],
  "output_style": "string",
  "fast_mode_state": "off | cooldown | on"
}
```

## 字段说明

### 核心标识字段

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `type` | `"system"` | 是 | 消息类型，固定为 `"system"` |
| `subtype` | `"init"` | 是 | 子类型，固定为 `"init"` |
| `session_id` | `string` | 是 | 当前会话的唯一标识符 |
| `uuid` | `string` | 该消息自身的唯一标识 |

### 环境信息

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `cwd` | `string` | 是 | 当前工作目录路径 |
| `model` | `string` | 是 | 当前使用的模型 ID，如 `"claude-sonnet-4-6"` |
| `claude_code_version` | `string` | 是 | Claude Code CLI 版本号 |
| `permissionMode` | `string` | 是 | 权限模式（见下方枚举） |
| `apiKeySource` | `string` | 是 | API Key 来源（见下方枚举） |
| `output_style` | `string` | 是 | 输出风格，默认 `"default"` |
| `fast_mode_state` | `string` | 否 | 快速模式状态（见下方枚举） |

### 权限模式 (`permissionMode`) 枚举

| 值 | 说明 |
|----|------|
| `"default"` | 标准模式，危险操作会弹出确认 |
| `"acceptEdits"` | 自动接受文件编辑操作 |
| `"bypassPermissions"` | 跳过所有权限检查（需要 allowDangerouslySkipPermissions） |
| `"plan"` | 规划模式，不执行实际工具调用 |
| `"dontAsk"` | 不弹出权限确认，未预批准则直接拒绝 |

### API Key 来源 (`apiKeySource`) 枚举

| 值 | 说明 |
|----|------|
| `"user"` | 用户级 API Key |
| `"project"` | 项目级 API Key |
| `"org"` | 组织级 API Key |
| `"temporary"` | 临时 API Key |
| `"oauth"` | OAuth 认证 |

### 快速模式状态 (`fast_mode_state`) 枚举

| 值 | 说明 |
|----|------|
| `"off"` | 未启用快速模式 |
| `"cooldown"` | 触发限流后冷却中 |
| `"on"` | 快速模式已启用 |

### 工具与能力字段

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `tools` | `string[]` | 是 | 当前会话可用的工具名称列表（如 `["Read", "Edit", "Bash"]`） |
| `mcp_servers` | `{ name: string, status: string }[]` | 是 | 已连接的 MCP 服务器列表及其状态 |
| `slash_commands` | `string[]` | 是 | 用户可调用的 slash command 名称列表 |
| **`skills`** | **`string[]`** | **是** | **用户可调用的 skill 名称列表** |
| `agents` | `string[]` | 否 | 可用的 agent 类型列表 |
| `plugins` | `{ name: string, path: string, source?: string }[]` | 是 | 已加载的插件列表 |
| `betas` | `string[]` | 否 | 已启用的 beta 功能标识列表 |

## Skill 列表详解

### 获取方式

`skills` 字段是一个 `string[]`，包含所有 `userInvocable !== false` 的 skill 名称。

```json
{
  "type": "system",
  "subtype": "init",
  "skills": [
    "commit",
    "simplify",
    "han-code-review-team",
    "han-c-coding-rules",
    "han-jira-analysis"
  ]
}
```

### 过滤规则

并非所有 skill 都会出现在列表中。skill 必须同时满足以下条件：

1. **`userInvocable !== false`** — 未被标记为禁止用户调用
2. **来自有效来源** — 从以下位置加载：
   - `~/.claude/skills/`（用户级 skill）
   - `.claude/skills/`（项目级 skill）
   - 内置 bundled skill
   - 插件提供的 skill
   - MCP 服务器注册的 skill
   - 动态发现的 skill

### 使用示例

#### Python SDK 消费示例

```python
import subprocess
import json

proc = subprocess.Popen(
    ["claude", "--output-format", "stream-json"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

# 读取第一条消息
first_line = proc.stdout.readline()
init_msg = json.loads(first_line)

if init_msg["type"] == "system" and init_msg["subtype"] == "init":
    skills = init_msg["skills"]
    print(f"Available skills ({len(skills)}):")
    for skill in skills:
        print(f"  /{skill}")
```

#### Node.js SDK 消费示例

```javascript
import { spawn } from "child_process";

const proc = spawn("claude", ["--output-format", "stream-json"]);

let buffer = "";

proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop(); // 保留不完整的行

  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);

    if (msg.type === "system" && msg.subtype === "init") {
      console.log("Available skills:", msg.skills);
    }
  }
});
```

#### 调用 Skill

获取 skill 列表后，可通过发送 `user` 消息来调用某个 skill：

```json
{
  "type": "user",
  "content": "/commit"
}
```

或在 content 中使用 skill 名称作为 slash command：

```json
{
  "type": "user",
  "content": "/han-jira-analysis S504-123"
}
```

## 相关源码文件

| 文件 | 职责 |
|------|------|
| `src/utils/messages/systemInit.ts` | 构建 `system/init` 消息，组装 `skills` 字段 |
| `src/commands.ts` | `getSlashCommandToolSkills()` — skill 加载与过滤核心函数 |
| `src/skills/loadSkillsDir.ts` | 从各来源加载 skill 文件 |
| `src/entrypoints/sdk/coreSchemas.ts` | `SDKSystemMessageSchema` — 消息的 Zod schema 定义 |
| `src/entrypoints/sdk/controlSchemas.ts` | 控制协议 schema（`initialize`、`reload_plugins` 等） |
