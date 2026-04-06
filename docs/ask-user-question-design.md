# AskUserQuestion 支持设计方案

**日期**: 2025-04-06
**作者**: Claude Code
**状态**: 设计中

---

## 一、背景

### 1.1 问题描述

当前 SessionMonitor 在处理 `AskUserQuestion` 工具调用时，仅显示简单的"工具请求授权"界面（允许/拒绝按钮）。但 `AskUserQuestion` 实际需要显示**交互式选项界面**，支持：
1. 从预设选项中进行选择
2. **直接输入自定义文本**代替选项选择

### 1.2 事件流程

```
PreToolUse (tool_name: "AskUserQuestion")
    │
    ├─→ 缓存 tool_use_id
    │
    ▼
PermissionRequest (双向通信)
    │
    ├─→ 当前：显示简单的允许/拒绝按钮
    │   └─ 问题：无法展示选项结构
    │
    └─→ 期望：显示交互式选项界面
        └─ 用户点击选项后自动响应
```

---

## 二、数据结构

### 2.1 toolInput 结构

```typescript
interface AskUserQuestionInput {
  questions: Array<{
    question: string      // 问题内容
    header?: string       // 标题（如"问题选择"）
    options: Array<{
      label: string       // 选项标签
      description: string // 选项描述
    }>
    multiSelect?: boolean // 是否多选，默认 false
  }>
}
```

### 2.2 实际示例

```json
{
  "questions": [{
    "question": "主公请示！是否遇到新问题需要分析？",
    "header": "问题选择",
    "options": [
      {
        "label": "新问题",
        "description": "输入一个新的问题描述，开始全新的代码分析"
      },
      {
        "label": "eag_del_usermac_filter_duplicate_call",
        "description": "过往问题"
      },
      {
        "label": "ipv6-llink-log-spam",
        "description": "过往问题"
      },
      {
        "label": "ipv6-portal-iptables-residual",
        "description": "过往问题"
      }
    ],
    "multiSelect": false
  }]
}
```

---

## 三、UI 设计

### 3.1 单选模式布局（含自定义输入）

```
┌─────────────────────────────────────────────┐
│  问题选择                                    │  ← header
├─────────────────────────────────────────────┤
│  主公请示！是否遇到新问题需要分析？          │  ← question
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │ 新问题                                │  │  ← option 1 (点击选中)
│  │ 输入一个新的问题描述，开始全新的...  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ eag_del_usermac_filter_duplicate_call│  │  ← option 2
│  │ 过往问题                              │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ ipv6-llink-log-spam                   │  │  ← option 3
│  │ 过往问题                              │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ ipv6-portal-iptables-residual         │  │  ← option 4
│  │ 过往问题                              │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │  ← 输入框（始终显示）
│  │ 或直接输入自定义答案...             │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────┐ ┌───────────┐    │
│  │ [发送自定义答案]    │ │ [确认选择] │    │  ← 双按钮
│  └─────────────────────┘ └───────────┘    │
└─────────────────────────────────────────────┘
```

### 3.2 选项选中状态

```
┌─────────────────────────────────────────────┐
│  问题选择                                    │
├─────────────────────────────────────────────┤
│  主公请示！是否遇到新问题需要分析？          │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │ 新问题                        [✓]    │  │  ← 已选中
│  │ 输入一个新的问题描述，开始全新的...  │  │
│  └───────────────────────────────────────┘  │  (蓝色背景)
│  ┌───────────────────────────────────────┐  │
│  │ eag_del_usermac_filter_duplicate_call│  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │
│  │ 或直接输入自定义答案...             │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────┐ ┌───────────┐    │
│  │ [发送自定义答案]    │ │ [确认选择] │    │  ← 确认按钮可用
│  └─────────────────────┘ └───────────┘    │
└─────────────────────────────────────────────┘
```

### 3.3 多选模式（multiSelect=true）

```
┌─────────────────────────────────────────────┐
│  问题选择                                    │
├─────────────────────────────────────────────┤
│  主公请示！请选择要执行的操作                │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │ 选项一                          [✓]   │  │  ← 可多选
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ 选项二                          [✓]   │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ 选项 three                              │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │
│  │ 或直接输入自定义答案（多个用换行）  │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────┐ ┌───────────┐    │
│  │ [发送自定义答案]    │ │ [确认选择] │    │
│  └─────────────────────┘ └───────────┘    │  ← 显示已选数量
└─────────────────────────────────────────────┘
```

### 3.4 组件结构

```tsx
<div className="ask-user-question">
  {/* 标题 */}
  <div className="aqu-header">{header}</div>

  {/* 问题内容 */}
  <div className="aqu-question">{question}</div>

  {/* 选项列表 */}
  <div className="aqu-options">
    {options.map((opt, idx) => (
      <button
        key={idx}
        className={`aqu-option ${selected.has(opt.label) ? 'selected' : ''}`}
        onClick={() => handleSelect(opt.label)}
      >
        <span className="aqu-option-label">{opt.label}</span>
        {multiSelect && (
          <span className="aqu-option-check">
            {selected.has(opt.label) ? '✓' : ''}
          </span>
        )}
        <span className="aqu-option-desc">{opt.description}</span>
      </button>
    ))}
  </div>

  {/* 自定义输入区域（始终显示） */}
  <div className="aqu-custom-input">
    <textarea
      className="aqu-textarea"
      placeholder={multiSelect ? "或直接输入自定义答案（多个答案用换行分隔）..." : "或直接输入自定义答案..."}
      value={customInput}
      onChange={(e) => setCustomInput(e.target.value)}
      rows={multiSelect ? 3 : 2}
    />
  </div>

  {/* 操作按钮 */}
  <div className="aqu-actions">
    <button
      className="aqu-btn-send"
      onClick={handleSendCustom}
      disabled={!customInput.trim()}
    >
      发送自定义答案
    </button>
    <button
      className="aqu-btn-confirm"
      onClick={handleConfirm}
      disabled={selected.size === 0}
    >
      确认选择 {selected.size > 0 && `(${selected.size})`}
    </button>
  </div>

  {/* 拒绝按钮 */}
  <button className="aqu-btn-deny" onClick={onDeny}>
    拒绝此请求
  </button>
</div>
```

---

## 四、交互逻辑

### 4.1 单选模式（multiSelect=false 或 undefined）

```
用户操作：
    │
    ├─→ 点击选项 → 高亮显示 → 点击"确认选择"按钮
    │                           │
    │                           ▼
    │                    IPC: session:answer(sessionId, selectedLabel)
    │
    └─→ 或：在输入框输入 → 点击"发送自定义答案"
                │
                ▼
        IPC: session:answer(sessionId, customInput)

响应处理：
    │
    ├─→ main.ts 构造响应
    │   {
    │     decision: "allow",
    │     reason: answer  // 选中的 label 或自定义文本
    │   }
    │
    ▼
Python Hook 接收响应
    │
    └─→ 输出到 Claude Code，继续执行
```

### 4.2 多选模式（multiSelect=true）

```
用户操作：
    │
    ├─→ 点击多个选项 → 高亮显示多个 → 点击"确认选择"
    │                       │
    │                       ▼
    │            IPC: session:answer(sessionId, JSON.stringify(selected))
    │                    // e.g. '["选项A","选项C"]'
    │
    └─→ 或：在输入框输入多行文本 → 点击"发送自定义答案"
                │
                ▼
        IPC: session:answer(sessionId, customInputLines)
            // 多选模式：将输入按行分割成数组
```

### 4.3 自定义输入处理

| 模式 | 输入处理 |
|------|----------|
| 单选 | 直接使用用户输入的文本 |
| 多选 | 将输入按换行符分割，去除空行，形成数组 |

### 4.4 拒绝操作

```
用户点击拒绝
    │
    ├─→ 复用现有的 session:deny 逻辑
    │
    ▼
响应: { decision: "deny", reason: "..." }
```

---

## 五、技术实现

### 5.1 检测逻辑

```typescript
// SessionTab.tsx

const isAskUserQuestion = session.toolName === "AskUserQuestion"

// 解析 questions
const parseQuestions = (toolInput: unknown): QuestionData | null => {
  if (!toolInput || typeof toolInput !== 'object') return null

  const input = toolInput as Record<string, unknown>
  const questions = input.questions as Array<unknown>

  if (!questions || questions.length === 0) return null

  const q = questions[0] as Record<string, unknown>
  return {
    question: q.question as string,
    header: q.header as string,
    options: q.options as Array<{label: string; description: string}>,
    multiSelect: q.multiSelect as boolean ?? false
  }
}
```

### 5.2 IPC 通信

#### main.ts 新增处理器

```typescript
// apps/desktop/src/main/index.ts

ipcMain.handle('session:answer', async (_event, sessionId: string, answer: string) => {
  console.log('[main] session:answer', sessionId, 'answer:', answer)

  const entry = pendingPermissionResolvers.get(sessionId)
  if (!entry) {
    console.error('[main] session:answer FAILED - no pending resolver for session:', sessionId)
    return
  }

  pendingPermissionResolvers.delete(sessionId)

  const response: HookResponse = {
    decision: 'allow',
    reason: answer  // 用户选中的 label 或 JSON 数组
  }

  if (entry.toolUseId) {
    await sessionStore?.resolvePermission(entry.toolUseId, response)
  }

  try {
    entry.resolve(response)
  } catch (err) {
    console.error('[main] Error during resolve:', err)
  }
})
```

#### preload 类型定义

```typescript
// apps/desktop/src/preload/index.d.ts

export interface API {
  // ... 现有方法
  session: {
    answer: (sessionId: string, answer: string) => Promise<void>
  }
}
```

### 5.3 React 组件

```typescript
// SessionTab.tsx 中添加组件

interface AskUserQuestionProps {
  question: string
  header?: string
  options: Array<{label: string; description: string}>
  multiSelect?: boolean
  onAnswer: (answer: string | string[]) => void
  onDeny: () => void
}

function AskUserQuestion({
  question,
  header = "请选择",
  options,
  multiSelect = false,
  onAnswer,
  onDeny
}: AskUserQuestionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = useState('')

  // 处理选项选择（单选/多选都只是高亮，不立即响应）
  const handleSelect = (label: string) => {
    const newSelected = new Set(selected)
    if (multiSelect) {
      // 多选：切换选中状态
      if (newSelected.has(label)) {
        newSelected.delete(label)
      } else {
        newSelected.add(label)
      }
    } else {
      // 单选：替换选中项
      newSelected.clear()
      newSelected.add(label)
    }
    setSelected(newSelected)
  }

  // 确认选择的选项
  const handleConfirm = () => {
    if (selected.size === 0) return

    if (multiSelect) {
      onAnswer(Array.from(selected))
    } else {
      // 单选模式，取唯一选中的项
      onAnswer(Array.from(selected)[0])
    }
  }

  // 发送自定义输入
  const handleSendCustom = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return

    if (multiSelect) {
      // 多选模式：按行分割
      const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      onAnswer(lines)
    } else {
      // 单选模式：直接使用
      onAnswer(trimmed)
    }
  }

  return (
    <div className="ask-user-question">
      {header && <div className="aqu-header">{header}</div>}
      <div className="aqu-question">{question}</div>

      <div className="aqu-options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={`aqu-option ${selected.has(opt.label) ? 'selected' : ''}`}
            onClick={() => handleSelect(opt.label)}
          >
            <span className="aqu-option-label">{opt.label}</span>
            {multiSelect && (
              <span className="aqu-option-check">
                {selected.has(opt.label) ? '✓' : ''}
              </span>
            )}
            <span className="aqu-option-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      <div className="aqu-custom-input">
        <textarea
          className="aqu-textarea"
          placeholder={multiSelect
            ? "或直接输入自定义答案（多个答案用换行分隔）..."
            : "或直接输入自定义答案..."}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          rows={multiSelect ? 3 : 2}
        />
      </div>

      <div className="aqu-actions">
        <button
          className="aqu-btn-send"
          onClick={handleSendCustom}
          disabled={!customInput.trim()}
        >
          发送自定义答案
        </button>
        <button
          className="aqu-btn-confirm"
          onClick={handleConfirm}
          disabled={selected.size === 0}
        >
          确认选择{selected.size > 0 && ` (${selected.size})`}
        </button>
      </div>

      <button className="aqu-btn-deny" onClick={onDeny}>
        拒绝此请求
      </button>
    </div>
  )
}
```

### 5.4 样式定义

```css
/* ChatPanel/styles.css */

.ask-user-question {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  margin: 8px 0;
}

.aqu-header {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.aqu-question {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.aqu-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aqu-option {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  position: relative;
}

.aqu-option:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
}

.aqu-option.selected {
  border-color: #2196f3;
  background: #e3f2fd;
}

.aqu-option-label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.aqu-option-check {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 14px;
  color: #2196f3;
}

.aqu-option-desc {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

/* 自定义输入区域 */
.aqu-custom-input {
  margin-top: 12px;
}

.aqu-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  min-height: 40px;
  background: white;
}

.aqu-textarea:focus {
  outline: none;
  border-color: #2196f3;
}

.aqu-textarea::placeholder {
  color: #999;
}

/* 操作按钮 */
.aqu-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.aqu-btn-send,
.aqu-btn-confirm {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.aqu-btn-send {
  background: #4caf50;
  color: white;
}

.aqu-btn-send:hover:not(:disabled) {
  background: #43a047;
}

.aqu-btn-send:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.aqu-btn-confirm {
  background: #2196f3;
  color: white;
}

.aqu-btn-confirm:hover:not(:disabled) {
  background: #1e88e5;
}

.aqu-btn-confirm:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.aqu-btn-deny {
  width: 100%;
  padding: 6px;
  margin-top: 8px;
  background: transparent;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: #999;
  font-size: 11px;
  cursor: pointer;
}

.aqu-btn-deny:hover {
  border-color: #f44336;
  color: #f44336;
}
```

---

## 六、边界情况处理

| 场景 | 处理方式 |
|------|----------|
| `toolName !== "AskUserQuestion"` | 使用现有的 PermissionBar 组件 |
| `toolInput` 为 null/undefined | 使用现有的 PermissionBar 组件 |
| `questions` 字段不存在 | 使用现有的 PermissionBar 组件 |
| `questions` 为空数组 | 显示"无有效选项" + 拒绝按钮 |
| `options` 为空数组 | 显示"无可用选项" + 拒绝按钮 |
| `multiSelect = true` 但只选了0项 | 确认按钮禁用，必须选择至少1项 |

### 降级逻辑

```typescript
// SessionTab.tsx 中

const renderPermissionUI = () => {
  if (session.toolName === "AskUserQuestion") {
    const questionData = parseQuestions(session.toolInput)
    if (questionData && questionData.options.length > 0) {
      return <AskUserQuestion {...questionData} onAnswer={...} onDeny={...} />
    }
    // 降级到普通 PermissionBar
  }
  return <PermissionBar {...props} />
}
```

---

## 七、实现文件清单

| 文件 | 修改内容 |
|------|----------|
| `apps/desktop/src/main/index.ts` | 添加 `session:answer` IPC 处理器 |
| `apps/desktop/src/preload/index.d.ts` | 添加 `session.answer` 类型定义 |
| `apps/desktop/src/renderer/components/ChatPanel/SessionTab.tsx` | 添加 `AskUserQuestion` 组件和检测逻辑 |
| `apps/desktop/src/renderer/components/ChatPanel/styles.css` | 添加 `.ask-user-question` 相关样式 |
| `packages/session-monitor/src/types.ts` | 添加 `AskUserQuestionInput` 类型定义（可选） |

---

## 八、测试计划

### 8.1 单选模式测试
- [ ] 显示问题标题和内容
- [ ] 显示所有选项
- [ ] 点击选项后高亮显示
- [ ] 点击"确认选择"后响应正确的 label
- [ ] 拒绝按钮正常工作
- [ ] 输入框始终可见
- [ ] 输入自定义文本后"发送自定义答案"按钮可用
- [ ] 点击"发送自定义答案"后响应输入的文本

### 8.2 多选模式测试
- [ ] 选项可多选
- [ ] 选中状态正确显示（带 ✓ 标记）
- [ ] 确认按钮显示已选数量
- [ ] 确认按钮禁用/启用状态正确
- [ ] 点击"确认选择"后响应 JSON 数组格式的 labels
- [ ] 拒绝按钮正常工作
- [ ] 输入框提示多行输入
- [ ] 多行自定义输入按换行分割成数组

### 8.3 自定义输入测试
- [ ] 单选模式：直接输入文本响应
- [ ] 多选模式：多行输入按行分割成数组
- [ ] 空输入时"发送自定义答案"按钮禁用
- [ ] 输入后清空选项选中状态

### 8.4 边界情况测试
- [ ] 无 questions 字段时降级到普通 PermissionBar
- [ ] 空 options 时显示错误提示
- [ ] 多选时未选任何项确认按钮禁用
- [ ] 自定义输入纯空格时按钮禁用
- [ ] 多选输入只有空行时处理正确

---

## 九、Markdown 渲染支持

### 9.1 需求描述

Assistant 消息内容需要支持 Markdown 格式渲染，包括：
- 代码块（语法高亮）
- 标题、加粗、斜体
- 列表、引用
- 链接、图片

### 9.2 技术方案

#### 方案选择

| 方案 | 优点 | 缺点 |
|------|------|------|
| `react-markdown` | 成熟、轻量、易用 | 需要额外依赖 |
| `marked` + `DOMPurify` | 性能好、灵活 | 需要手动处理 XSS |
| 自建解析器 | 无依赖 | 维护成本高 |

**推荐使用 `react-markdown`**，配合 `remark-gfm` 支持 GitHub 风格 Markdown。

#### 安装依赖

```bash
npm install react-markdown remark-gfm
```

### 9.3 组件实现

```typescript
// SessionTab.tsx

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function MessageItem({ item }: { item: ChatItem }): React.JSX.Element {
  switch (item.type) {
    case 'user':
      return (
        <div className="chat-msg chat-msg--user">
          <div className="chat-msg__bubble">{item.content}</div>
        </div>
      )

    case 'assistant':
      return (
        <div className="chat-msg chat-msg--assistant">
          <div className="chat-msg__bubble chat-msg__markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // 自定义代码块渲染
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline ? (
                    <pre className="chat-msg__code-block">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code className="chat-msg__inline-code" {...props}>
                      {children}
                    </code>
                  )
                },
                // 自定义链接渲染
                a({ node, children, ...props }) {
                  return (
                    <a {...props} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  )
                }
              }}
            >
              {item.content}
            </ReactMarkdown>
          </div>
        </div>
      )

    // ... 其他类型
  }
}
```

### 9.4 样式定义

```css
/* ChatPanel/styles.css */

/* Markdown 基础样式 */
.chat-msg__markdown {
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

.chat-msg__markdown h1,
.chat-msg__markdown h2,
.chat-msg__markdown h3,
.chat-msg__markdown h4,
.chat-msg__markdown h5,
.chat-msg__markdown h6 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
}

.chat-msg__markdown h1 { font-size: 18px; }
.chat-msg__markdown h2 { font-size: 16px; }
.chat-msg__markdown h3 { font-size: 14px; }

.chat-msg__markdown p {
  margin: 8px 0;
}

.chat-msg__markdown ul,
.chat-msg__markdown ol {
  margin: 8px 0;
  padding-left: 20px;
}

.chat-msg__markdown li {
  margin: 4px 0;
}

.chat-msg__markdown blockquote {
  margin: 8px 0;
  padding: 8px 12px;
  border-left: 3px solid #ddd;
  background: #f9f9f9;
  color: #666;
}

.chat-msg__markdown strong {
  font-weight: 600;
}

.chat-msg__markdown em {
  font-style: italic;
}

/* 代码块 */
.chat-msg__code-block {
  margin: 8px 0;
  padding: 10px;
  background: #1e1e1e;
  border-radius: 4px;
  overflow-x: auto;
}

.chat-msg__code-block code {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #d4d4d4;
}

/* 行内代码 */
.chat-msg__inline-code {
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  color: #e83e8c;
}

/* 链接 */
.chat-msg__markdown a {
  color: #2196f3;
  text-decoration: none;
}

.chat-msg__markdown a:hover {
  text-decoration: underline;
}

/* 表格（GFM） */
.chat-msg__markdown table {
  margin: 8px 0;
  border-collapse: collapse;
  width: 100%;
}

.chat-msg__markdown th,
.chat-msg__markdown td {
  padding: 6px 10px;
  border: 1px solid #ddd;
}

.chat-msg__markdown th {
  background: #f5f5f5;
  font-weight: 600;
}

.chat-msg__markdown tr:nth-child(even) {
  background: #f9f9f9;
}

/* 分隔线 */
.chat-msg__markdown hr {
  margin: 12px 0;
  border: none;
  border-top: 1px solid #ddd;
}
```

### 9.5 安全性考虑

使用 `react-markdown` 时需要注意：
- 默认情况下会转义 HTML 标签（防止 XSS）
- 如需渲染 HTML，需配合 `rehype-raw` 和 `DOMPurify`

```typescript
// 如果需要支持 HTML（谨慎使用）
import DOMPurify from 'isomorphic-dompurify'

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeRaw]}
  components={{
    div({ node, children, ...props }) {
      // 清理 HTML 后渲染
      return <div {...props} dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(String(children))
      }} />
    }
  }}
>
  {item.content}
</ReactMarkdown>
```

### 9.6 实现文件清单

| 文件 | 修改内容 |
|------|----------|
| `apps/desktop/package.json` | 添加 `react-markdown`、`remark-gfm` 依赖 |
| `apps/desktop/src/renderer/components/ChatPanel/SessionTab.tsx` | 导入并使用 `ReactMarkdown` |
| `apps/desktop/src/renderer/components/ChatPanel/styles.css` | 添加 Markdown 样式 |

---

## 十、后续优化

1. **代码语法高亮**：集成 `react-syntax-highlighter`
2. **LaTeX 公式**：添加 `remark-math` + `katex` 支持
3. **Mermaid 图表**：添加 `mermaid` 流程图支持
4. **复制按钮**：代码块添加复制功能
5. **AskUserQuestion 交互优化**：
   - 键盘导航（上下箭头选择，回车确认）
   - 快捷键（1/2/3/4 数字键快速选择）
   - 动画效果（选项悬停、选中动画）
   - 自定义样式（支持主题配置）

---

**文档版本**: 1.2
**最后更新**: 2025-04-06

### 版本历史
- **v1.2** (2025-04-06): 添加 Markdown 渲染支持
- **v1.1** (2025-04-06): 添加自定义输入功能支持
- **v1.0** (2025-04-06): 初始设计
