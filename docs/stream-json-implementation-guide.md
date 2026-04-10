# Claude Code Stream-JSON 模式实现指南

基于 cc-connect 项目的 `agent/claudecode/` 包分析，详细说明如何通过 stdin/stdout JSON 流协议与 Claude Code CLI 进行双向通信。

---

## 一、核心协议

Claude Code 的 stream-json 模式本质是一个**基于 stdin/stdout 的 JSON Lines 协议**（每行一个 JSON 对象，以 `\n` 分隔）。

### 1.1 启动参数

```bash
claude \
  --output-format stream-json \      # 输出 JSON 流
  --input-format stream-json \       # 接收 JSON 流输入
  --permission-prompt-tool stdio \   # 权限请求走 stdin/stdout
  [--resume <session-id>] \          # 恢复已有会话
  [--continue --fork-session] \      # 继续最近的会话（fork 避免冲突）
  [--model <model>] \                # 指定模型
  [--permission-mode <mode>] \       # 权限模式
  [--allowedTools <csv>] \           # 预授权工具
  [--disallowedTools <csv>] \        # 禁用工具
  [--append-system-prompt <text>] \  # 追加系统提示
  [--max-context-tokens <n>]         # 最大上下文 token
```

### 1.2 环境变量注意事项

```go
// 必须过滤 CLAUDECODE 环境变量，否则 Claude Code 会认为自己是嵌套会话
env = filterEnv(os.Environ(), "CLAUDECODE")
```

过滤所有以 `CLAUDECODE` 开头的环境变量（如 `CLAUDECODE_SESSION_ID`），防止 Claude Code 检测到"嵌套会话"而拒绝运行。

### 1.3 会话恢复策略

| sessionID 参数 | 行为 |
|---|---|
| 空字符串 | 新建会话，不传任何恢复参数 |
| `"continue"` | `--continue --fork-session`，接续最近的会话 |
| 具体 session ID | `--resume <ID>`，精确恢复指定会话 |

`--fork-session` 的作用：`--continue` 会抓取工作区中最近的会话，但那个会话可能属于一个活跃的 CLI 终端，fork 可以分叉出独立上下文分支避免冲突。

---

## 二、消息协议格式

### 2.1 写入 stdin（你 → Claude Code）

#### 发送用户消息

```json
{"type":"user","message":{"role":"user","content":"你好"}}
```

#### 带图片的多模态消息

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {"type":"image","source":{"type":"base64","media_type":"image/png","data":"<base64编码>"}},
      {"type":"text","text":"请分析这张图片"}
    ]
  }
}
```

#### 带文件的消息

文件不能直接通过 stdin 传输，需要先保存到磁盘，在 prompt 中引用文件路径：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "请分析以下文件\n\n(Files saved locally, please read them: /path/to/file1, /path/to/file2)"
  }
}
```

#### 权限响应（允许）

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<request_id>",
    "response": {
      "behavior": "allow",
      "updatedInput": {"原始工具输入key":"value"}
    }
  }
}
```

注意三层嵌套结构：外层 `type`、中层 `response`（含 `request_id` 和 `subtype`）、内层 `response`（`behavior` 等）。

#### 权限响应（拒绝）

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<request_id>",
    "response": {
      "behavior": "deny",
      "message": "用户拒绝了此操作"
    }
  }
}
```

### 2.2 读取 stdout（Claude Code → 你）

#### 系统事件（启动后第一条）

```json
{"type":"system","session_id":"abc-123","subtype":"init"}
```

用于获取 Claude Code 分配的会话 ID。

#### 助手文本输出

```json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"回答内容"}]}}
```

`content` 是数组，可能包含多个 block（text + tool_use + thinking 混合）。

#### 工具调用

```json
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_xxx","name":"Bash","input":{"command":"ls"}}]}}
```

#### 工具结果（Claude Code 将执行结果回传给 API）

```json
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_xxx","content":"file1.txt\nfile2.txt","is_error":false}]}}
```

注意：`type` 是 `"user"`（不是 `"tool_result"`），需要从 `content` 数组中解析。

#### 思考过程（扩展思考）

```json
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"让我分析一下..."}]}}
```

#### 权限请求

```json
{
  "type": "control_request",
  "request_id": "req_xxx",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "input": {"command":"rm -rf /"}
  }
}
```

仅处理 `subtype == "can_use_tool"` 的请求，其他 subtype 仅记录日志。

#### 权限取消

```json
{"type":"control_cancel_request","request_id":"req_xxx"}
```

#### 最终结果（一轮对话结束标志）

```json
{
  "type": "result",
  "result": "完整回复文本",
  "session_id": "abc-123",
  "usage": {"input_tokens": 1500, "output_tokens": 800}
}
```

收到 `result` 事件表示当前 turn 结束，可以开始下一轮对话。JSON 中的数字解析为 `float64`。

---

## 三、事件类型汇总

| stdout 事件类型 | 含义 | 处理方式 |
|---|---|---|
| `system` | 系统初始化，含 session_id | 提取并存储 session_id |
| `assistant` | 文本/工具调用/思考 | 解析 content 数组，按 block type 分发 |
| `user` | 工具执行结果 | 仅日志记录，不透传给上层 |
| `result` | 最终结果，turn 结束标志 | 提取文本、session_id、token 用量 |
| `control_request` | 权限请求 | 根据模式自动处理或推给用户 |
| `control_cancel_request` | 权限请求被取消 | 仅日志记录 |

assistant content block 类型：

| block type | 含义 |
|---|---|
| `text` | 文本输出 |
| `tool_use` | 工具调用，含 name 和 input |
| `thinking` | 扩展思考过程 |

---

## 四、实现要点

### 4.1 进程生命周期

```
启动 → exec.Command("claude", args...)
      → StdinPipe() / StdoutPipe()
      → cmd.Start()
      → go readLoop(stdout)

运行 → readLoop 逐行读取 stdout
      → 根据 type 字段分发到 handleXxx()
      → 转换为统一 Event 结构推入 channel

关闭 → Phase 1: 关闭 stdin（优雅退出，等 120s）
      → Phase 2: SIGTERM（等 5s）
      → Phase 3: SIGKILL（强制）
```

### 4.2 关键设计决策

| 决策 | 原因 |
|---|---|
| Scanner 缓冲区设 10MB | 单行 JSON 可能很大（工具输出、文件内容） |
| events channel 缓冲 64 | 平滑生产者-消费者速率差异 |
| stdin 写入加 Mutex | 防止 Send 和 RespondPermission 并发写入导致数据交错 |
| 过滤 CLAUDECODE 环境变量 | 防止 Claude Code 检测到嵌套会话而拒绝运行 |
| `--fork-session` 配合 `--continue` | 避免 hijack 正在终端中使用的会话 |
| 三阶段关闭 | 给 Claude Code 时间执行 Stop hooks（如记忆摘要） |
| JSON 数字解析为 float64 | Go 的 `encoding/json` 将 JSON 数字统一解析为 float64 |
| `AskUserQuestion` 工具不透传 | 这是 Claude Code 内部交互工具，不应对外暴露 |

### 4.3 权限模式处理逻辑

```
收到 control_request (subtype=can_use_tool)
  ├── bypassPermissions → 自动写回 allow（不通知上层）
  ├── dontAsk           → 自动写回 deny
  ├── acceptEdits       → 编辑类工具(Edit/Write/NotebookEdit/MultiEdit)自动 allow，其他走手动
  ├── auto              → 由 Claude Code 内部决定是否需要确认
  ├── plan              → 规划模式，执行阶段需要确认
  └── default           → 推 EventPermissionRequest 到 channel，等待用户响应
```

自动批准的权限请求**不经过 events channel**，直接在 `readLoop` 中调用 `RespondPermission` 写回响应，上层无感知。

### 4.4 图片处理流程

```
1. 保存图片到磁盘: {workDir}/.cc-connect/attachments/img_{timestamp}_{index}.{ext}
2. 构建 base64 内容项: {"type":"image","source":{"type":"base64","media_type":"...","data":"..."}}
3. 追加本地路径到文本: "(Images also saved locally: path1, path2)"
4. 组装多模态消息写入 stdin
```

### 4.5 文件处理流程

```
1. 保存文件到磁盘: {workDir}/.cc-connect/attachments/{filename}
2. 追加路径引用到文本: "(Files saved locally, please read them: path1, path2)"
3. Claude Code 通过内置工具（如 Read）读取文件
```

---

## 五、数据结构定义

### 5.1 核心接口

```go
// Agent — 工厂和管理器
type Agent interface {
    Name() string
    StartSession(ctx context.Context, sessionID string) (AgentSession, error)
    ListSessions(ctx context.Context) ([]AgentSessionInfo, error)
    Stop() error
}

// AgentSession — 运行中的会话实例
type AgentSession interface {
    Send(prompt string, images []ImageAttachment, files []FileAttachment) error
    RespondPermission(requestID string, result PermissionResult) error
    Events() <-chan Event
    CurrentSessionID() string
    Alive() bool
    Close() error
}
```

### 5.2 统一事件结构

```go
type Event struct {
    Type         EventType       // 事件类型
    Content      string          // 文本内容
    ToolName     string          // 工具名称
    ToolInput    string          // 工具输入摘要
    ToolInputRaw map[string]any  // 工具原始输入（用于构建 allow 响应）
    ToolResult   string          // 工具执行结果
    SessionID    string          // 会话 ID
    RequestID    string          // 权限请求 ID
    Questions    []UserQuestion  // AskUserQuestion 结构化问题
    Done         bool            // turn 结束标志
    Error        error           // 错误
    InputTokens  int             // 输入 token 用量
    OutputTokens int             // 输出 token 用量
}
```

### 5.3 事件类型常量

```go
const (
    EventText              EventType = "text"
    EventToolUse           EventType = "tool_use"
    EventToolResult        EventType = "tool_result"
    EventResult            EventType = "result"
    EventError             EventType = "error"
    EventPermissionRequest EventType = "permission_request"
    EventThinking          EventType = "thinking"
)
```

### 5.4 权限结果

```go
type PermissionResult struct {
    Behavior     string         // "allow" 或 "deny"
    UpdatedInput map[string]any // 允许时回传的工具输入（原样或修改后）
    Message      string         // 拒绝时的原因
}
```

---

## 六、最小实现模板（Python）

```python
import subprocess
import json
import threading
from typing import Optional, Callable


class ClaudeSession:
    """Claude Code stream-json 模式的最小实现"""

    def __init__(self, work_dir: str, session_id: Optional[str] = None,
                 model: Optional[str] = None, permission_mode: Optional[str] = None):
        args = [
            "claude",
            "--output-format", "stream-json",
            "--input-format", "stream-json",
            "--permission-prompt-tool", "stdio",
        ]

        if session_id:
            args += ["--resume", session_id]
        if model:
            args += ["--model", model]
        if permission_mode:
            args += ["--permission-mode", permission_mode]

        self.proc = subprocess.Popen(
            args, cwd=work_dir,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.session_id: Optional[str] = None
        self._on_event: Optional[Callable] = None
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _read_loop(self):
        """逐行读取 stdout，解析 JSON 事件"""
        for line in self.proc.stdout:
            line = line.decode().strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                continue
            self._handle_event(raw)

    def _handle_event(self, raw: dict):
        """根据 type 字段分发事件"""
        event_type = raw.get("type")

        if event_type == "system":
            self.session_id = raw.get("session_id")

        elif event_type == "assistant":
            msg = raw.get("message", {})
            for block in msg.get("content", []):
                block_type = block.get("type")
                if block_type == "text":
                    self._emit({"type": "text", "content": block["text"]})
                elif block_type == "tool_use":
                    self._emit({"type": "tool_use", "name": block["name"],
                                "input": block.get("input", {})})
                elif block_type == "thinking":
                    self._emit({"type": "thinking", "content": block["thinking"]})

        elif event_type == "result":
            self.session_id = raw.get("session_id", self.session_id)
            self._emit({
                "type": "result",
                "content": raw.get("result", ""),
                "done": True,
                "usage": raw.get("usage", {}),
            })

        elif event_type == "control_request":
            self._handle_permission(raw)

    def _handle_permission(self, raw: dict):
        """权限请求处理 — 默认自动批准"""
        request_id = raw.get("request_id", "")
        request = raw.get("request", {})
        tool_name = request.get("tool_name", "")
        input_data = request.get("input", {})

        # 此处可根据业务需求决定自动批准或推给用户
        self._emit({"type": "permission_request",
                     "request_id": request_id,
                     "tool_name": tool_name,
                     "input": input_data})

    def _emit(self, event: dict):
        if self._on_event:
            self._on_event(event)

    def on_event(self, callback: Callable):
        """注册事件回调"""
        self._on_event = callback

    def send(self, text: str):
        """发送用户消息"""
        msg = {"type": "user", "message": {"role": "user", "content": text}}
        self._write(msg)

    def allow_permission(self, request_id: str, input_data: dict):
        """批准权限请求"""
        resp = {
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": request_id,
                "response": {"behavior": "allow", "updatedInput": input_data},
            },
        }
        self._write(resp)

    def deny_permission(self, request_id: str, reason: str = ""):
        """拒绝权限请求"""
        resp = {
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": request_id,
                "response": {"behavior": "deny", "message": reason or "Permission denied."},
            },
        }
        self._write(resp)

    def _write(self, obj: dict):
        """写入 JSON + 换行到 stdin"""
        data = json.dumps(obj) + "\n"
        self.proc.stdin.write(data.encode())
        self.proc.stdin.flush()

    def close(self):
        """三阶段关闭"""
        # Phase 1: 关闭 stdin，等待优雅退出
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=120)
            return
        except subprocess.TimeoutExpired:
            pass

        # Phase 2: SIGTERM
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            pass

        # Phase 3: SIGKILL
        self.proc.kill()
        self.proc.wait()
```

### 使用示例

```python
# 创建会话
session = ClaudeSession(work_dir="/path/to/project")

# 注册事件回调
def handle_event(event):
    if event["type"] == "text":
        print(f"Claude: {event['content']}")
    elif event["type"] == "result":
        print(f"\n[完成] {event['content']}")
    elif event["type"] == "permission_request":
        # 自动批准所有请求
        session.allow_permission(event["request_id"], event["input"])

session.on_event(handle_event)

# 发送消息
session.send("帮我分析当前项目的目录结构")

# 等待完成后关闭
import time; time.sleep(30)
session.close()
```

---

## 七、进阶功能参考

以下功能 cc-connect 已实现，可根据需要选择性移植：

| 功能 | 说明 | 实现位置 |
|---|---|---|
| 会话持久化 | SessionManager 将会话状态序列化为 JSON 文件 | `core/session.go` |
| 会话列表 | 解析 `~/.claude/projects/{key}/` 下的 JSONL 文件 | `agent/claudecode/claudecode.go` |
| 会话历史 | 逐行解析 JSONL 提取 user/assistant 消息 | 同上 |
| 多 Provider 支持 | 切换不同的 API 后端（Bedrock、Vertex 等） | `core/interfaces.go` ProviderSwitcher |
| Provider 代理 | 本地反向代理重写 thinking 参数 | `agent/claudecode/provider_proxy.go` |
| 实时模式切换 | 不重启进程切换权限模式 | `session.go` SetLiveMode |
| 消息排队 | turn 进行中的消息排队，结束后依次处理 | `core/engine.go` drainPendingMessages |
| 流式预览 | 支持消息更新（MessageUpdater）的平台可实时更新 | `core/engine.go` streaming |
| 自定义命令 | 通过 `--append-system-prompt` 注入额外能力 | `session.go` newClaudeSession |
| 多工作区 | 同一 Agent 实例服务多个工作目录 | `core/engine.go` multi-workspace |
