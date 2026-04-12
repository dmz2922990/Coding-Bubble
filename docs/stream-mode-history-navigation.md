# Stream 模式下上下键切换历史输入记录

## 背景

Claude Code 的 Stream/Stdio 协议（NDJSON）中 **没有暴露历史输入相关的消息类型**。协议完整消息清单如下，不含任何 `history` / `input_history` / `prompt_history` 类型：

- **客户端 → CLI**：`user`、`control_request`（initialize / interrupt / can_use_tool / set_permission_mode / ...）、`control_response`、`keep_alive`
- **CLI → 客户端**：`assistant`、`stream_event`、`system`（init / status / ...）、`result`、`tool_progress`、`prompt_suggestion`、`control_request`、`auth_status`

因此，通过 Stream 接入的外部客户端需要**自行维护历史输入**，实现 ↑/↓ 键导航功能。

## 方案：客户端本地维护历史

### 核心思路

客户端在每次发送 `user` 消息时记录输入文本，↑/↓ 键由客户端自行处理，不依赖 Claude Code。

### 数据结构

```typescript
interface HistoryEntry {
  display: string        // 用户输入文本
  timestamp: number      // 发送时间戳（Date.now()）
  sessionId?: string     // 会话 ID，用于区分不同会话
}

// 历史存储
class InputHistory {
  private entries: HistoryEntry[] = []
  private maxItems = 100
  private historyIndex = -1       // -1 表示不在历史导航中
  private draft = ''              // 用户当前未提交的输入（草稿）
  private draftSaved = false

  /**
   * 用户提交时记录历史
   */
  add(input: string): void {
    if (input.trim() === '') return

    this.entries.unshift({
      display: input,
      timestamp: Date.now(),
    })

    // 超出上限时裁剪
    if (this.entries.length > this.maxItems) {
      this.entries.pop()
    }

    this.historyIndex = -1
    this.draftSaved = false
  }

  /**
   * ↑ 键 - 向前翻阅历史（更早的记录）
   */
  navigateUp(currentInput: string): string | null {
    // 首次按 ↑ 时保存当前草稿
    if (this.historyIndex === -1) {
      this.draft = currentInput
      this.draftSaved = true
    }

    if (this.historyIndex < this.entries.length - 1) {
      this.historyIndex++
      return this.entries[this.historyIndex]!.display
    }

    return null  // 已到最早记录，不再翻页
  }

  /**
   * ↓ 键 - 向后翻阅历史（更新的记录）
   */
  navigateDown(): string | null {
    if (this.historyIndex > 0) {
      this.historyIndex--
      return this.entries[this.historyIndex]!.display
    }

    if (this.historyIndex === 0) {
      this.historyIndex = -1
      return this.draftSaved ? this.draft : ''
    }

    return null  // 已在初始位置，不处理
  }

  /**
   * 提交后重置导航状态
   */
  reset(): void {
    this.historyIndex = -1
    this.draftSaved = false
  }
}
```

### 集成到 Stream 客户端

```typescript
import * as readline from 'readline'

const history = new InputHistory()
let currentInput = ''

// 监听键盘输入
readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)
process.stdin.on('keypress', (str, key) => {
  if (key.name === 'up') {
    const entry = history.navigateUp(currentInput)
    if (entry !== null) {
      currentInput = entry
      renderInput(currentInput)
    }
  } else if (key.name === 'down') {
    const entry = history.navigateDown()
    if (entry !== null) {
      currentInput = entry
      renderInput(currentInput)
    }
  } else if (key.name === 'return') {
    // 发送消息到 Claude Code
    sendMessage(currentInput)
    history.add(currentInput)
    currentInput = ''
  } else if (key.name === 'escape') {
    // 取消输入时重置历史导航
    history.reset()
  }
  // ... 其他按键处理
})

// 发送消息到 Claude Code Stream
function sendMessage(text: string): void {
  const message = {
    type: 'user',
    content: text,
  }
  // 写入 stdin（NDJSON 格式）
  process.stdout.write(JSON.stringify(message) + '\n')
}

function renderInput(text: string): void {
  // 渲染当前输入到终端 UI
  // ...
}
```

### 持久化（可选）

如果需要在客户端重启后保留历史，可写入本地文件：

```typescript
import { appendFile, readFile } from 'fs/promises'
import { join } from 'path'

const HISTORY_FILE = join(process.env.HOME!, '.my-client', 'history.jsonl')

class PersistentInputHistory extends InputHistory {
  async load(): Promise<void> {
    try {
      const content = await readFile(HISTORY_FILE, 'utf8')
      const lines = content.trim().split('\n').filter(Boolean)
      this.entries = lines
        .map(line => JSON.parse(line))
        .sort((a, b) => b.timestamp - a.timestamp)  // 最新的在前
        .slice(0, this.maxItems)
    } catch {
      // 文件不存在，忽略
    }
  }

  add(input: string): void {
    super.add(input)
    // 异步追加写入，不阻塞
    const entry = { display: input, timestamp: Date.now() }
    void appendFile(HISTORY_FILE, JSON.stringify(entry) + '\n')
  }
}
```

### 参考设计要点

以下设计要点源自 Claude Code 内部实现（`src/hooks/useArrowKeyHistory.tsx`），可供客户端参考：

| 要点 | 说明 |
|------|------|
| **草稿保存** | 首次按 ↑ 时保存当前未提交的输入，按 ↓ 回到底部时恢复 |
| **索引边界保护** | ↑ 超出最早记录时不翻页；↓ 回到初始位置后返回草稿或空字符串 |
| **提交后重置** | 每次提交后 `historyIndex` 归 -1，避免干扰下一轮导航 |
| **同步索引** | 快速连按时确保索引值是最新的（参考：使用同步变量而非异步状态） |
| **上限裁剪** | 限制最大条目数（Claude Code 用 100 条），防止内存无限增长 |

### 不推荐的替代方案

| 方案 | 问题 |
|------|------|
| 读取 `~/.claude/history.jsonl` | 强依赖本地文件路径，远程客户端无法访问；文件格式可能随版本变更 |
| 扩展 Stream 协议添加历史消息 | 需要修改 Claude Code 源码，维护成本高 |
