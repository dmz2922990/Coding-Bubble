# Claude Island Hooks 完整分析报告

**生成日期**: 2026年4月6日
**项目**: ClaudeIsland
**分析范围**: Hooks监听、事件处理、工具追踪
Project DIR: /Users/Daniel.Duan/Work/Code/AI code/claude-island 
---

## 目录

- [一、项目概述](#一项目概述)
- [二、架构设计](#二架构设计)
- [三、监听的Hooks列表](#三监听的hooks列表)
- [四、各Hook处理逻辑详解](#四各hook处理逻辑详解)
- [五、工具事件处理分析](#五工具事件处理分析)
- [六、数据流图](#六数据流图)
- [七、关键设计细节](#七关键设计细节)
- [八、文件索引](#八文件索引)

---

## 一、项目概述

Claude Island 是一个 macOS 原生应用，通过监听 Claude Code 的 hooks 事件来实现：

- **会话状态追踪**: 实时监控多个 Claude Code 会话
- **权限管理**: 提供图形化界面批准/拒绝工具调用
- **UI通知**: 在菜单栏显示会话状态和权限请求
- **子代理追踪**: 聚合显示 Task 工具调用的子工具

**技术栈**:
- 前端: Swift + SwiftUI
- 后端: Python Hook脚本
- 通信: Unix Domain Socket

---

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude Code                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Hook Event
┌─────────────────────────────────────────────────────────────────┐
│  ~/.claude/settings.json                                        │
│  ├─ hooks:                                                       │
│  │    ├─ UserPromptSubmit → ~/.claude/hooks/*.py               │
│  │    ├─ PreToolUse      → ~/.claude/hooks/*.py               │
│  │    ├─ PostToolUse     → ~/.claude/hooks/*.py               │
│  │    ├─ PermissionRequest → ~/.claude/hooks/*.py             │
│  │    └─ ...                                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Unix Socket: /tmp/claude-island.sock
┌─────────────────────────────────────────────────────────────────┐
│  HookSocketServer.swift                                         │
│  ├─ 接收事件                      │
│  ├─ 缓存 tool_use_id (FIFO队列)                               │
│  ├─ 处理权限响应 (双向通信)                                     │
│  └─ 清理待处理请求                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HookEvent
┌─────────────────────────────────────────────────────────────────┐
│  SessionStore.swift (Actor - 线程安全)                         │
│  ├─ 状态管理                                                    │
│  ├─ 会话追踪                                                    │
│  ├─ 工具状态更新                                                │
│  └─ 文件同步调度                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Publisher
┌─────────────────────────────────────────────────────────────────┐
│  ClaudeSessionMonitor (ObservableObject)                       │
│  ├─ UI 绑定                                                      │
│  ├─ 权限决策处理                                                 │
│  └─ 中断监听协调                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  SwiftUI UI         │
                    │  (NotchMenuView)    │
                    └─────────────────────┘
```

---

## 三、监听的Hooks列表

| Hook 事件 | 配置位置 | Matcher | 超时设置 | 通信类型 |
|----------|---------|---------|---------|---------|
| `UserPromptSubmit` | HookInstaller.swift:59 | 无（全局） | 无 | 单向 |
| `PreToolUse` | HookInstaller.swift:60 | `*` | 无 | 单向 |
| `PostToolUse` | HookInstaller.swift:61 | `*` | 无 | 单向 |
| `PermissionRequest` | HookInstaller.swift:62 | `*` | 86400秒（24小时） | **双向** |
| `Notification` | HookInstaller.swift:63 | `*` | 无 | 单向 |
| `Stop` | HookInstaller.swift:64 | 无（全局） | 无 | 单向 |
| `SubagentStop` | HookInstaller.swift:65 | 无（全局） | 无 | 单向 |
| `SessionStart` | HookInstaller.swift:66 | 无（全局） | 无 | 单向 |
| `SessionEnd` | HookInstaller.swift:67 | 无（全局） | 无 | 单向 |
| `PreCompact` | HookInstaller.swift:68 | `auto`, `manual` | 无 | 单向 |

### 配置示例

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-island-state.py"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/claude-island-state.py",
            "timeout": 86400
          }
        ]
      }
    ]
  }
}
```

---

## 四、各Hook处理逻辑详解

### 4.1 UserPromptSubmit

**触发时机**: 用户提交提示词时

**处理流程**:
```python
# claude-island-state.py:99-101
elif event == "UserPromptSubmit":
    state["status"] = "processing"
    send_event(state)  # 单向通信
```

**Swift处理**:
```swift
// SessionStore.swift
let newPhase = event.determinePhase()  // → .processing
session.phase = newPhase
```

---

### 4.2 PreToolUse

**触发时机**: Claude 调用工具之前

**处理流程**:
```python
# claude-island-state.py:103-110
elif event == "PreToolUse":
    state["status"] = "running_tool"
    state["tool"] = data.get("tool_name")
    state["tool_input"] = tool_input
    state["tool_use_id"] = data.get("tool_use_id")  # 关键：携带ID
```

**Swift处理**:
```swift
// HookSocketServer.swift:306-319
private func cacheToolUseId(event: HookEvent) {
    let key = "\(sessionId):\(toolName):\(toolInputJSON)"
    toolUseIdCache[key]?.append(toolUseId)  // FIFO缓存
}

// SessionStore.swift:185-227
func processPreToolUse(...) {
    session.toolTracker.startTool(id: toolUseId, name: toolName)

    // 创建占位符 ChatHistoryItem
    let placeholderItem = ChatHistoryItem(
        id: toolUseId,
        type: .toolCall(ToolCallItem(
            name: toolName,
            input: input,
            status: .running,
            result: nil,
            structuredResult: nil,
            subagentTools: []
        )),
        timestamp: Date()
    )
    session.chatItems.append(placeholderItem)
}
```

**关键点**: 缓存 tool_use_id 用于后续 PermissionRequest 关联

---

### 4.3 PostToolUse

**触发时机**: 工具执行完成之后

**处理流程**:
```python
# claude-island-state.py:112-119
elif event == "PostToolUse":
    state["status"] = "processing"
    state["tool"] = data.get("tool_name")
    state["tool_use_id"] = data.get("tool_use_id")
```

**Swift处理**:
```swift
// ClaudeSessionMonitor.swift:59-61
if event.event == "PostToolUse", let toolUseId = event.toolUseId {
    HookSocketServer.shared.cancelPendingPermission(toolUseId: toolUseId)
}

// SessionStore.swift:229-247
func processPostToolUse(...) {
    session.toolTracker.completeTool(id: toolUseId, success: true)
    updateToolStatus(in: &session, toolId: toolUseId, status: .success)
}
```

---

### 4.4 PermissionRequest ⭐ 核心功能

**触发时机**: 工具需要用户批准时

**双向通信流程**:
```
1. Claude Code → Python Hook
   └─ 输入: tool_name, tool_input (无 tool_use_id!)

2. Python Hook → Socket Server
   └─ 从缓存获取 tool_use_id
   └─ 发送事件 + 保持连接打开

3. Socket Server
   └─ 创建 PendingPermission
   └─ 保存 clientSocket
   └─ 触发 onEvent 回调

4. SessionStore
   └─ 更新工具状态为 .waitingForApproval
   └─ UI 显示权限弹窗

5. 用户操作 → Socket Server
   └─ 调用 respondToPermission(toolUseId, decision)

6. Socket Server → Python Hook
   └─ 写入 JSON 响应
   └─ 关闭连接

7. Python Hook → Claude Code
   └─ 输出: {"hookSpecificOutput": {"decision": {"behavior": "allow"}}}
   └─ 或: {"hookSpecificOutput": {"decision": {"behavior": "deny"}}}
```

**Python代码**:
```python
# claude-island-state.py:121-161
elif event == "PermissionRequest":
    state["status"] = "waiting_for_approval"
    state["tool"] = data.get("tool_name")
    state["tool_input"] = tool_input

    # 发送到 app 并等待决策
    response = send_event(state)

    if response:
        decision = response.get("decision", "ask")
        reason = response.get("reason", "")

        if decision == "allow":
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PermissionRequest",
                    "decision": {"behavior": "allow"},
                }
            }
            print(json.dumps(output))
            sys.exit(0)

        elif decision == "deny":
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PermissionRequest",
                    "decision": {
                        "behavior": "deny",
                        "message": reason or "Denied by user via ClaudeIsland",
                    },
                }
            }
            print(json.dumps(output))
            sys.exit(0)

    # 无响应或 "ask" - 让 Claude Code 显示其正常 UI
    sys.exit(0)
```

**Swift代码**:
```swift
// HookSocketServer.swift:424-465
if event.expectsResponse {
    let toolUseId = popCachedToolUseId(event: event) ?? event.toolUseId

    let pending = PendingPermission(
        sessionId: event.sessionId,
        toolUseId: toolUseId,
        clientSocket: clientSocket,  // 保持连接打开
        event: updatedEvent,
        receivedAt: Date()
    )
    pendingPermissions[toolUseId] = pending

    eventHandler?(updatedEvent)
    return  // 不关闭连接
}

// HookSocketServer.swift:473-505
private func sendPermissionResponse(toolUseId: String, decision: String, reason: String?) {
    let response = HookResponse(decision: decision, reason: reason)
    let data = try? JSONEncoder().encode(response)

    data.withUnsafeBytes { bytes in
        write(pending.clientSocket, baseAddress, data.count)
    }

    close(pending.clientSocket)  // 响应后关闭连接
}
```

**超时设置**:
- Python端: 5 分钟 (300秒)
- settings.json: 24 小时 (86400秒)

---

### 4.5 Notification

**触发时机**: Claude 发送通知时

**处理流程**:
```python
# claude-island-state.py:163-173
elif event == "Notification":
    notification_type = data.get("notification_type")

    # 跳过 permission_prompt - PermissionRequest 处理得更好
    if notification_type == "permission_prompt":
        sys.exit(0)
    elif notification_type == "idle_prompt":
        state["status"] = "waiting_for_input"
    else:
        state["status"] = "notification"

    state["notification_type"] = notification_type
    state["message"] = data.get("message")
```

**处理的通知类型**:
| 类型 | 状态 | 说明 |
|-----|------|-----|
| `permission_prompt` | 跳过 | 由 PermissionRequest 处理 |
| `idle_prompt` | waiting_for_input | 等待用户输入 |
| 其他 | notification | 通用通知 |

---

### 4.6 Stop

**触发时机**: Claude 会话停止时

**处理流程**:
```python
# claude-island-state.py:175-176
elif event == "Stop":
    state["status"] = "waiting_for_input"
```

**Swift处理**:
```swift
// ClaudeSessionMonitor.swift:55-57
if event.event == "Stop" {
    HookSocketServer.shared.cancelPendingPermissions(sessionId: event.sessionId)
}

// SessionStore.swift:160-162
if event.event == "Stop" {
    session.subagentState = SubagentState()  // 清除子代理状态
}
```

---

### 4.7 SubagentStop

**触发时机**: 子代理完成时

**处理流程**:
```python
# claude-island-state.py:178-180
elif event == "SubagentStop":
    state["status"] = "waiting_for_input"
```

**Swift处理**:
```swift
// SessionStore.swift:268-276
case "SubagentStop":
    Self.logger.debug("SubagentStop received")
    // 子代理工具将从 agent 文件加载
```

---

### 4.8 SessionStart

**触发时机**: 新会话开始

**处理流程**:
```python
# claude-island-state.py:182-184
elif event == "SessionStart":
    state["status"] = "waiting_for_input"
```

**Swift处理**:
```swift
// SessionStore.swift:120-126
let isNewSession = sessions[sessionId] == nil
if isNewSession {
    Mixpanel.mainInstance().track(event: "Session Started")
}
var session = sessions[sessionId] ?? createSession(from: event)
```

---

### 4.9 SessionEnd

**触发时机**: 会话结束时

**处理流程**:
```python
# claude-island-state.py:186-188
elif event == "SessionEnd":
    state["status"] = "ended"
```

**Swift处理**:
```swift
// SessionStore.swift:138-142
if event.status == "ended" {
    sessions.removeValue(forKey: sessionId)
    cancelPendingSync(sessionId: sessionId)
    return
}

// HookSocketServer.swift:345-356
private func cleanupCache(sessionId: String) {
    let keysToRemove = toolUseIdCache.keys.filter { $0.hasPrefix("\(sessionId):") }
    for key in keysToRemove {
        toolUseIdCache.removeValue(forKey: key)
    }
}
```

---

### 4.10 PreCompact

**触发时机**: 上下文压缩时（手动或自动）

**处理流程**:
```python
# claude-island-state.py:189-192
elif event == "PreCompact":
    state["status"] = "compacting"
```

**配置**:
```swift
// HookInstaller.swift:51-54
let preCompactConfig: [[String: Any]] = [
    ["matcher": "auto", "hooks": hookEntry],
    ["matcher": "manual", "hooks": hookEntry]
]
```

---

## 五、工具事件处理分析

### 5.1 ToolEventProcessor 概述

`ToolEventProcessor` 是一个独立的枚举类型，负责处理工具相关的所有事件逻辑。

**职责**:
1. 工具生命周期追踪
2. 子代理工具聚合
3. 工具状态同步

**文件位置**: `ClaudeIsland/Services/State/ToolEventProcessor.swift`

---

### 5.2 事件处理函数

#### 5.2.1 PreToolUse 工具追踪

**函数**: `processPreToolUse(event:session:)`

**代码位置**: `ToolEventProcessor.swift:21-47`

**处理流程**:
```swift
static func processPreToolUse(event: HookEvent, session: inout SessionState) {
    // 1. 验证必要字段
    guard let toolUseId = event.toolUseId, let toolName = event.tool else { return }

    // 2. 启动工具追踪
    session.toolTracker.startTool(id: toolUseId, name: toolName)

    // 3. 检查是否已存在（去重）
    let toolExists = session.chatItems.contains { $0.id == toolUseId }

    if !toolExists {
        // 4. 提取工具输入
        let input = extractToolInput(from: event.toolInput)

        // 5. 创建占位符
        let placeholderItem = ChatHistoryItem(
            id: toolUseId,
            type: .toolCall(ToolCallItem(
                name: toolName,
                input: input,
                status: .running,
                result: nil,
                structuredResult: nil,
                subagentTools: []
            )),
            timestamp: Date()
        )
        session.chatItems.append(placeholderItem)
    }
}
```

**关键逻辑**:
- **子代理工具特殊处理**: 如果工具是由子代理调用的（非Task），不在顶层创建占位符
  ```swift
  let isSubagentTool = session.subagentState.hasActiveSubagent && toolName != "Task"
  if isSubagentTool {
      return  // 子代理工具会挂载到父 Task 下
  }
  ```

---

#### 5.2.2 PostToolUse 工具追踪

**函数**: `processPostToolUse(event:session:)`

**代码位置**: `ToolEventProcessor.swift:49-58`

**处理流程**:
```swift
static func processPostToolUse(event: HookEvent, session: inout SessionState) {
    guard let toolUseId = event.toolUseId else { return }

    // 标记工具完成
    session.toolTracker.completeTool(id: toolUseId, success: true)

    // 更新状态
    updateToolStatus(in: &session, toolId: toolUseId, status: .success)
}
```

---

#### 5.2.3 PreToolUse 子代理追踪

**函数**: `processSubagentPreToolUse(event:session:)`

**代码位置**: `ToolEventProcessor.swift:63-84`

**处理流程**:
```swift
static func processSubagentPreToolUse(event: HookEvent, session: inout SessionState) {
    guard let toolUseId = event.toolUseId else { return }

    if event.tool == "Task" {
        // Task 工具 - 启动子代理任务追踪
        session.subagentState.startTask(taskToolId: toolUseId)
    } else if let toolName = event.tool, session.subagentState.hasActiveSubagent {
        // 其他工具 - 添加到子代理工具列表
        let input = extractToolInput(from: event.toolInput)
        let subagentTool = SubagentToolCall(
            id: toolUseId,
            name: toolName,
            input: input,
            status: .running,
            timestamp: Date()
        )
        session.subagentState.addSubagentTool(subagentTool)
    }
}
```

**数据结构**:
```swift
struct SubagentToolCall {
    let id: String                  // tool_use_id
    let name: String                // 工具名称
    let input: [String: String]     // 工具输入
    var status: ToolStatus          // 运行状态
    let timestamp: Date             // 时间戳
}
```

---

#### 5.2.4 PostToolUse 子代理追踪

**函数**: `processSubagentPostToolUse(event:session:)`

**代码位置**: `ToolEventProcessor.swift:87-108`

**处理流程**:
```swift
static func processSubagentPostToolUse(event: HookEvent, session: inout SessionState) {
    guard let toolUseId = event.toolUseId else { return }

    if event.tool == "Task" {
        // Task 完成 - 挂载所有子代理工具
        if let taskContext = session.subagentState.activeTasks[toolUseId] {
            attachSubagentToolsToTask(
                session: &session,
                taskToolId: toolUseId,
                subagentTools: taskContext.subagentTools
            )
        }
        session.subagentState.stopTask(taskToolId: toolUseId)
    } else {
        // 其他工具 - 更新状态
        session.subagentState.updateSubagentToolStatus(toolId: toolUseId, status: .success)
    }
}
```

**挂载逻辑** (`attachSubagentToolsToTask`):
```swift
private static func attachSubagentToolsToTask(
    session: inout SessionState,
    taskToolId: String,
    subagentTools: [SubagentToolCall]
) {
    guard !subagentTools.isEmpty else { return }

    for i in 0..<session.chatItems.count {
        if session.chatItems[i].id == taskToolId,
           case .toolCall(var tool) = session.chatItems[i].type {
            // 将子代理工具列表附加到 Task
            tool.subagentTools = subagentTools
            session.chatItems[i] = ChatHistoryItem(
                id: taskToolId,
                type: .toolCall(tool),
                timestamp: session.chatItems[i].timestamp
            )
            break
        }
    }
}
```

---

#### 5.2.5 转移所有子代理工具

**函数**: `transferAllSubagentTools(session:markAsInterrupted:)`

**代码位置**: `ToolEventProcessor.swift:111-128`

**用途**: 在中断或停止时，将所有活动的子代理工具转移到对应的 Task

**处理流程**:
```swift
static func transferAllSubagentTools(
    session: inout SessionState,
    markAsInterrupted: Bool = false
) {
    for (taskId, taskContext) in session.subagentState.activeTasks {
        var tools = taskContext.subagentTools

        if markAsInterrupted {
            // 标记所有运行中的工具为中断
            for i in 0..<tools.count {
                if tools[i].status == .running {
                    tools[i].status = .interrupted
                }
            }
        }

        attachSubagentToolsToTask(
            session: &session,
            taskToolId: taskId,
            subagentTools: tools
        )
    }

    session.subagentState = SubagentState()  // 清空状态
}
```

---

#### 5.2.6 更新工具状态

**函数**: `updateToolStatus(in:toolId:status:)`

**代码位置**: `ToolEventProcessor.swift:133-153`

**处理流程**:
```swift
static func updateToolStatus(
    in session: inout SessionState,
    toolId: String,
    status: ToolStatus
) {
    for i in 0..<session.chatItems.count {
        if session.chatItems[i].id == toolId,
           case .toolCall(var tool) = session.chatItems[i].type,
           tool.status == .waitingForApproval || tool.status == .running {
            tool.status = status
            session.chatItems[i] = ChatHistoryItem(
                id: toolId,
                type: .toolCall(tool),
                timestamp: session.chatItems[i].timestamp
            )
            return
        }
    }
}
```

**状态验证**: 只更新 `waitingForApproval` 或 `running` 状态的工具

---

#### 5.2.7 查找下一个待批准工具

**函数**: `findNextPendingTool(in:excluding:)`

**代码位置**: `ToolEventProcessor.swift:156-167`

**用途**: 当一个工具被批准后，查找是否还有其他工具待批准

**返回值**: `(id: String, name: String, timestamp: Date)?`

**处理流程**:
```swift
static func findNextPendingTool(
    in session: SessionState,
    excluding toolId: String
) -> (id: String, name: String, timestamp: Date)? {
    for item in session.chatItems {
        if item.id == toolId { continue }
        if case .toolCall(let tool) = item.type, tool.status == .waitingForApproval {
            return (id: item.id, name: tool.name, timestamp: item.timestamp)
        }
    }
    return nil
}
```

---

#### 5.2.8 标记运行中的工具为中断

**函数**: `markRunningToolsInterrupted(session:)`

**代码位置**: `ToolEventProcessor.swift:170-182`

**用途**: 会话中断时，标记所有运行中的工具

**处理流程**:
```swift
static func markRunningToolsInterrupted(session: inout SessionState) {
    for i in 0..<session.chatItems.count {
        if case .toolCall(var tool) = session.chatItems[i].type,
           tool.status == .running {
            tool.status = .interrupted
            session.chatItems[i] = ChatHistoryItem(
                id: session.chatItems[i].id,
                type: .toolCall(tool),
                timestamp: session.chatItems[i].timestamp
            )
        }
    }
}
```

---

### 5.3 工具输入提取

**函数**: `extractToolInput(from:)`

**代码位置**: `ToolEventProcessor.swift:210-224`

**用途**: 将 `AnyCodable` 类型的 tool_input 转换为 `[String: String]`

**支持的类型转换**:
```swift
private static func extractToolInput(from hookInput: [String: AnyCodable]?) -> [String: String] {
    var input: [String: String] = [:]
    guard let hookInput = hookInput else { return input }

    for (key, value) in hookInput {
        if let str = value.value as? String {
            input[key] = str
        } else if let num = value.value as? Int {
            input[key] = String(num)
        } else if let bool = value.value as? Bool {
            input[key] = bool ? "true" : "false"
        }
    }
    return input
}
```

---

### 5.4 调用关系图

```
SessionStore.processHookEvent()
    │
    ├─→ processToolTracking()
    │       │
    │       ├─→ ToolEventProcessor.processPreToolUse()
    │       │       ├─ toolTracker.startTool()
    │       │       └─ 创建占位符 ChatHistoryItem
    │       │
    │       └─→ ToolEventProcessor.processPostToolUse()
    │               ├─ toolTracker.completeTool()
    │               └─ updateToolStatus(.success)
    │
    └─→ processSubagentTracking()
            │
            ├─→ ToolEventProcessor.processSubagentPreToolUse()
            │       ├─ Task: subagentState.startTask()
            │       └─ 其他: subagentState.addSubagentTool()
            │
            └─→ ToolEventProcessor.processSubagentPostToolUse()
                    ├─ Task: attachSubagentToolsToTask() + stopTask()
                    └─ 其他: subagentState.updateSubagentToolStatus()
```

---

### 5.5 工具状态转换图

```
                    ┌─────────────────────────────────┐
                    │      PreToolUse 触发             │
                    └─────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │          .running               │
                    └─────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
            需要批准              正常执行           中断发生
                    │                 │                 │
                    ▼                 ▼                 ▼
    ┌───────────────────────┐   ┌───────────┐   ┌──────────────┐
    │ .waitingForApproval   │   │ .success  │   │ .interrupted │
    └───────────────────────┘   └───────────┘   └──────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    批准        拒绝          Socket失败
        │           │           │
        ▼           ▼           ▼
    .running    .error      .error
        │           │           │
        └───────────┴───────────┘
                    │
                    ▼
                .success
```

---

## 六、数据流图

### 6.1 完整事件流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Claude Code                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                用户提交       工具调用      需要批准
                    │             │             │
                    ▼             ▼             ▼
            UserPromptSubmit  PreToolUse  PermissionRequest
                    │             │             │
                    ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      claude-island-state.py                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  构建事件状态:                                                   │   │
│  │  { session_id, cwd, event, status, tool, tool_input, tool_use_id } │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│              ┌───────────────┴───────────────┐                          │
│              │                               │                          │
│         普通事件                        PermissionRequest               │
│              │                               │                          │
│              ▼                               ▼                          │
│         send_event()                  send_event() + wait()            │
│         (fire & forget)                (阻塞等待响应)                   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ Unix Socket: /tmp/claude-island.sock
┌─────────────────────────────────────────────────────────────────────────┐
│                       HookSocketServer.swift                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  接收事件:                                                       │   │
│  │  - PreToolUse: 缓存 tool_use_id (FIFO)                          │   │
│  │  - PermissionRequest: 保持连接打开, 等待响应                     │   │
│  │  - SessionEnd: 清理缓存                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼ HookEvent                                │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SessionStore.swift (Actor)                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  process(.hookReceived(event))                                  │   │
│  │                                                                  │   │
│  │  ├─ 更新 session.phase                                          │   │
│  │  ├─ processToolTracking() → ToolEventProcessor                  │   │
│  │  ├─ processSubagentTracking() → ToolEventProcessor              │   │
│  │  └─ scheduleFileSync() → 解析 JSONL 文件                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼ CurrentValueSubject<[SessionState]>      │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   ClaudeSessionMonitor (@MainActor)                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  @Published var instances: [SessionState]                        │   │
│  │  @Published var pendingInstances: [SessionState]                 │   │
│  │                                                                  │   │
│  │  权限处理:                                                       │   │
│  │  - approvePermission() → Socket.respondToPermission("allow")    │   │
│  │  - denyPermission() → Socket.respondToPermission("deny")        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │   SwiftUI UI        │
                        │  (NotchMenuView)    │
                        │                     │
                        │  - 显示会话列表      │
                        │  - 权限批准弹窗      │
                        │  - 工具状态指示      │
                        └─────────────────────┘
```

### 6.2 权限请求双向通信流

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PermissionRequest 双向通信详细流程                                      │
└─────────────────────────────────────────────────────────────────────────┘

Claude Code                      Python Hook                    Swift App
     │                              │                              │
     │  需要批准工具                  │                              │
     ├─────────────────────────────>│                              │
     │  HookEvent:                   │                              │
     │  - tool_name                  │                              │
     │  - tool_input                 │                              │
     │  (无 tool_use_id!)            │                              │
     │                              │                              │
     │                              │  构建状态:                    │
     │                              │  - status: waiting_for_approval
     │                              │  - tool_use_id: 从缓存获取    │
     │                              │                              │
     │                              │  连接 Socket                  │
     │                              ├─────────────────────────────>│
     │                              │  send_event() + 保持连接      │
     │                              │                              │
     │                              │                              │  缓存
     │                              │                              │  pendingPermission
     │                              │                              │  (保存 clientSocket)
     │                              │                              │
     │                              │                              │  更新状态:
     │                              │                              │  .waitingForApproval
     │                              │                              │
     │                              │                              │  显示 UI:
     │                              │                              │  "允许 Bash?"
     │                              │                              │
     │                              │                    用户点击允许 │
     │                              │                              │
     │                              │  等待响应...  <─────────────┤
     │                              │                              │
     │                              │<─────────────────────────────┤
     │                              │  JSON: {"decision": "allow"} │
     │                              │                              │
     │  输出决策                      │                              │
     │<─────────────────────────────┤                              │
     │  {"hookSpecificOutput":       │                              │
     │   {"decision":                │                              │
     │    {"behavior": "allow"}}}    │                              │
     │                              │                              │
     │  继续执行工具                  │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
```

---

## 七、关键设计细节

### 7.1 tool_use_id 关联机制

**问题**: `PermissionRequest` 事件不包含 `tool_use_id`，但需要关联到具体的工具调用

**解决方案**: FIFO 预缓存队列

```
时间线:
t1: PreToolUse (tool_use_id: "abc123", tool: "Bash", input: {...})
    └─ 缓存键: "session_id:Bash:{sortedJSON}"
    └─ 队列: ["abc123"]

t2: PermissionRequest (tool: "Bash", input: {...})
    └─ 查找缓存键: "session_id:Bash:{sortedJSON}"
    └─ 弹出: "abc123"
    └─ 关联成功!
```

**代码位置**: `HookSocketServer.swift:285-342`

**确定性编码**:
```swift
private static let sortedEncoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys  // 确保键顺序一致
    return encoder
}()
```

---

### 7.2 权限请求同步机制

**Python端阻塞等待**:
```python
response = sock.recv(4096)  # 阻塞直到收到响应
if response:
    decision = json.loads(response.decode())
    # 输出决策给 Claude Code
```

**Swift端保持连接**:
```swift
if event.expectsResponse {
    // 不调用 close(clientSocket)
    // 保存到 pendingPermissions 等待响应
    pendingPermissions[toolUseId] = PendingPermission(
        clientSocket: clientSocket,  // 保持打开
        ...
    )
}
```

**响应时关闭**:
```swift
write(pending.clientSocket, ...)
close(pending.clientSocket)  // 响应后关闭
```

---

### 7.3 文件同步防抖

**问题**: 每次 hook 事件都解析 JSONL 会造成大量重复工作

**解决方案**: 100ms 防抖 + 增量解析

```swift
// 取消之前的同步任务
cancelPendingSync(sessionId: sessionId)

// 调度新的防抖任务
pendingSyncs[sessionId] = Task {
    try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms
    guard !Task.isCancelled else { return }

    // 解析增量 - 只获取新消息
    let result = await ConversationParser.shared.parseIncremental(
        sessionId: sessionId,
        cwd: cwd
    )

    await process(.fileUpdated(payload))
}
```

**代码位置**: `SessionStore.swift:921-956`

---

### 7.4 子代理工具聚合

**问题**: 子代理（Task）调用的工具需要在 UI 中正确显示

**解决方案**: 两阶段挂载

```
阶段1: PreToolUse (子代理工具)
    └─ 添加到 subagentState.activeTasks[taskId].subagentTools

阶段2: SubagentStop / 文件更新
    └─ 将 subagentTools 挂载到 Task 的 ChatHistoryItem
    └─ 清空 subagentState
```

**数据结构**:
```swift
struct ToolCallItem {
    let name: String
    let input: [String: String]
    var status: ToolStatus
    var result: String?
    var structuredResult: ToolResultData?
    var subagentTools: [SubagentToolCall]  // 子工具列表
}
```

---

### 7.5 线程安全

**SessionStore 使用 Actor**:
```swift
actor SessionStore {
    private var sessions: [String: SessionState] = [:]

    func process(_ event: SessionEvent) async {
        // 所有状态变更都在 actor 隔离域内
        // 自动串行化，保证线程安全
    }
}
```

**Socket 服务器使用 DispatchQueue**:
```swift
private let queue = DispatchQueue(label: "com.claudeisland.socket", qos: .userInitiated)

func start(onEvent: @escaping HookEventHandler) {
    queue.async { [weak self] in
        self?.startServer(onEvent: onEvent)
    }
}
```

---

## 八、文件索引

| 功能 | 文件路径 | 关键内容 |
|-----|---------|---------|
| Hook 安装/卸载 | `ClaudeIsland/Services/Hooks/HookInstaller.swift` | - `installIfNeeded()`: 安装脚本和配置<br>- `uninstall()`: 清理配置<br>- `isInstalled()`: 检查安装状态 |
| Socket 服务器 | `ClaudeIsland/Services/Hooks/HookSocketServer.swift` | - Unix Socket 监听<br>- tool_use_id 缓存<br>- 权限响应处理<br>- `HookEvent` / `HookResponse` 结构 |
| Python Hook 脚本 | `ClaudeIsland/Resources/claude-island-state.py` | - 所有 hook 事件处理<br>- TTY 检测<br>- 权限双向通信 |
| 状态管理 | `ClaudeIsland/Services/State/SessionStore.swift` | - `process()`: 中央事件处理器<br>- 会话状态管理<br>- 文件同步调度<br>- Combine 发布者 |
| 工具事件处理 | `ClaudeIsland/Services/State/ToolEventProcessor.swift` | - `processPreToolUse()`: 工具开始<br>- `processPostToolUse()`: 工具完成<br>- 子代理工具追踪<br>- 状态更新辅助函数 |
| UI 监控器 | `ClaudeIsland/Services/Session/ClaudeSessionMonitor.swift` | - `@Published` UI 状态<br>- `approvePermission()` / `denyPermission()`<br>- 中断监听协调 |
| 会话监控 | `ClaudeIsland/Services/Session/JSONLInterruptWatcher.swift` | - JSONL 文件监控<br>- 中断检测 (Ctrl+C) |
| 应用入口 | `ClaudeIsland/App/AppDelegate.swift` | - `applicationDidFinishLaunching()`: 启动 Hook 安装<br>- Mixpanel 集成<br>- 单实例保证 |
| UI 视图 | `ClaudeIsland/UI/Views/NotchMenuView.swift` | - 菜单栏 UI<br>- Hook 安装开关<br>- 会话列表显示 |

---

## 附录：数据结构定义

### HookEvent
```swift
struct HookEvent: Codable, Sendable {
    let sessionId: String
    let cwd: String
    let event: String          // Hook 事件名
    let status: String         // 会话状态
    let pid: Int?
    let tty: String?
    let tool: String?          // 工具名
    let toolInput: [String: AnyCodable]?
    let toolUseId: String?
    let notificationType: String?
    let message: String?
}
```

### SessionState
```swift
struct SessionState: Identifiable {
    let id: String             // sessionId
    let sessionId: String
    let cwd: String
    let projectName: String
    var pid: Int?
    var tty: String?
    var isInTmux: Bool
    var phase: SessionPhase
    var lastActivity: Date
    var chatItems: [ChatHistoryItem]
    var toolTracker: ToolTracker
    var subagentState: SubagentState
    var conversationInfo: ConversationInfo?
    var needsClearReconciliation: Bool
}
```

### SessionPhase
```swift
enum SessionPhase {
    case idle
    case processing
    case waitingForApproval(PermissionContext)
    case waitingForInput
    case compacting
}
```

### ChatHistoryItem
```swift
struct ChatHistoryItem {
    let id: String
    let type: ChatItemType
    let timestamp: Date
}

enum ChatItemType {
    case user(String)
    case assistant(String)
    case toolCall(ToolCallItem)
    case thinking(String)
    case interrupted
}
```

---

**报告结束**

*此报告由 Claude Code 自动生成，详细分析了 Claude Island 项目的 Hooks 事件处理机制。*
