# AskUserQuestion Hook 机制分析

## 执行流程

```
Claude 调用 AskUserQuestion
  → PreToolUse hooks 执行（可预填 answers 并自动 allow）
  → 若未被 hook 拦截 → 弹出 UI 对话框给用户
  → 同时异步执行 PermissionRequest hooks
  → 用户选择/hook决策 → call() 方法接收 answers → 返回结果
```

## 关键源码文件

| 文件 | 作用 |
|------|------|
| `src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx` | Tool 定义，input/output schema |
| `src/hooks/toolPermission/handlers/interactiveHandler.ts` | 交互式权限处理，hook 与用户 UI 竞争 |
| `src/hooks/toolPermission/PermissionContext.ts` | `runHooks()` 执行 PermissionRequest hooks |
| `src/services/tools/toolHooks.ts` | `resolveHookPermissionDecision()` 解析 hook 决策 |
| `src/types/hooks.ts` | Hook 类型定义，`syncHookResponseSchema` |
| `src/utils/hooks.ts` | `executePermissionRequestHooks()` 执行引擎 |

## 核心机制：updatedInput 满足交互需求

`src/services/tools/toolHooks.ts:347-354`:

```typescript
// Hook provided updatedInput for an interactive tool — the hook IS the
// user interaction (e.g. headless wrapper that collected AskUserQuestion
// answers). Treat as non-interactive for the rule-check path.
const interactionSatisfied =
  requiresInteraction && hookPermissionResult.updatedInput !== undefined
```

**只要 `updatedInput` 包含 `answers` 且 `permissionDecision` 为 `allow`，AskUserQuestion 的交互需求就被视为已满足**，完全跳过 UI 对话框。

## Input Schema 结构

AskUserQuestion 的 input schema:

```typescript
{
  questions: [  // 1-4 个问题
    {
      question: string,       // 完整问题文本
      header: string,         // 短标签（chip/tag）
      options: [              // 2-4 个选项
        {
          label: string,      // 选项显示文本
          description: string, // 选项说明
          preview?: string    // 可选预览内容
        }
      ],
      multiSelect: boolean    // 是否多选，默认 false
    }
  ],
  answers?: Record<string, string>,  // 用户答案（question text -> answer label）
  annotations?: Record<string, {
    preview?: string,
    notes?: string
  }>,
  metadata?: {
    source?: string
  }
}
```

## 在 Hook 中选择 Label 的方案

### 方案 1：PreToolUse Hook（推荐）

hook 收到的 stdin 输入：

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [
      {
        "question": "Which approach?",
        "header": "Approach",
        "options": [
          {"label": "Option A", "description": "Description A"},
          {"label": "Option B", "description": "Description B"}
        ],
        "multiSelect": false
      }
    ]
  }
}
```

hook 的 stdout 输出（选择某个 label）：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "questions": [
        {
          "question": "Which approach?",
          "header": "Approach",
          "options": [
            {"label": "Option A", "description": "Description A"},
            {"label": "Option B", "description": "Description B"}
          ],
          "multiSelect": false
        }
      ],
      "answers": {
        "Which approach?": "Option A"
      }
    }
  }
}
```

> **注意**：`answers` 的 key 是 `question` 的完整文本，value 是选中 option 的 `label` 字符串。`updatedInput` 中必须保留完整的 `questions` 字段。

### 方案 2：PermissionRequest Hook

在用户对话框弹出后异步拦截：

hook 收到的 stdin 输入：

```json
{
  "hook_event_name": "PermissionRequest",
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [...]
  },
  "permission_suggestions": [...]
}
```

hook 的 stdout 输出：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": {
        "questions": [...],
        "answers": {
          "Which approach?": "Option A"
        }
      }
    }
  }
}
```

### 方案 3：Async Prompt 协议

适用于 hook 需要展示选项并等待外部系统选择的场景：

```json
// 第 1 步：声明 async 模式
{"async": true}

// 第 2 步：通过 stdout 发送 prompt 请求给用户
{
  "prompt": "req-123",
  "message": "请选择一个选项：",
  "options": [
    {"key": "a", "label": "Option A", "description": "..."},
    {"key": "b", "label": "Option B", "description": "..."}
  ]
}

// 第 3 步：从 stdin 读取 Claude Code 返回的用户选择
{"prompt_response": "req-123", "selected": "a"}

// 第 4 步：根据选择输出最终结果
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "questions": [...],
      "answers": {"Which approach?": "Option A"}
    }
  }
}
```

### 方案 4：deny 后注入 additionalContext

如果不想自动 allow，而是提供额外信息后让用户自行选择：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "additionalContext": "检测到 label 信息：Option A, Option B。建议选择 Option A。"
  }
}
```

## 多选场景（multiSelect: true）

当 `multiSelect` 为 true 时，`answers` 的 value 为逗号分隔的多个 label：

```json
{
  "answers": {
    "Which features do you want?": "Feature A,Feature C"
  }
}
```

## Hook 决策优先级

在 `interactiveHandler.ts` 中，多个决策来源竞争（race）：

1. **本地用户交互** — 用户在 TUI 中选择
2. **Bridge 回调** — claude.ai 远程响应
3. **Channel 回调** — Telegram/Discord 等渠道
4. **PermissionRequest hooks** — 异步执行的 hooks
5. **Bash Classifier** — 自动分类器（仅 Bash 工具）

使用 `claim()` 原子操作确保只有一个来源胜出，其余被忽略。

## settings.json 配置示例

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/my-hook.js"
          }
        ]
      }
    ]
  }
}
```

或使用 PermissionRequest hook：

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/my-hook.js"
          }
        ]
      }
    ]
  }
}
```
