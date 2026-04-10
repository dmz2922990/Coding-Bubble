# CodeIsland 跳转终端功能实现分析

## 一、整体架构

用户在刘海面板点击"跳转"按钮后，`TerminalJumper` 采用分层回退策略定位终端：

```
用户点击"跳转"按钮
       ↓
  TerminalJumper.jump(to: session)
       ↓
  ┌──────────────────────────┐
  │ Strategy 1: tmux + Yabai │  ← 最精确
  ├──────────────────────────┤
  │ Strategy 2: 终端专属方案  │  ← AppleScript/CLI
  ├──────────────────────────┤
  │ Strategy 3: 通用回退     │  ← Bundle ID 激活
  └──────────────────────────┘
```

---

## 二、终端检测：如何知道用户用什么终端？

**实现位置：** `ProcessTreeBuilder.swift`

通过进程树回溯检测终端类型：

```
Claude Code (PID 12345)
    ↑ ppid
  zsh (PID 12000)
    ↑ ppid
  Ghostty (PID 11000)  ← 命中已知终端名！
```

执行 `ps -eo pid,ppid,tty,comm`，逐级向上查找父进程，直到匹配 `TerminalAppRegistry` 中注册的终端名。

### TerminalAppRegistry 维护的映射表

**实现位置：** `TerminalAppRegistry.swift`

| 终端 | Bundle ID |
|------|-----------|
| Ghostty | `com.mitchellh.ghostty` |
| iTerm2 | `com.googlecode.iterm2` |
| Terminal.app | `com.apple.Terminal` |
| Warp | `dev.warp.Warp-Stable` |
| Kitty | `net.kovidgoyal.kitty` |
| WezTerm | `com.github.wez.wezterm` |
| Alacritty | `io.alacritty` |
| cmux | `com.cmuxterm.app` |
| VS Code | `com.microsoft.VSCode` |
| Cursor | `com.todesktop.230313mzl4w4u92` |
| Zed | `dev.zed.Zed` |

---

## 三、Strategy 1：tmux + Yabai（最精确）

适用于 tmux 会话，三步定位：

1. **`TmuxTargetFinder`** — 列出所有 tmux pane 及其 PID，找到包含 Claude 进程的那个 pane，得到 `session:window.pane` 标识
2. **`TmuxController`** — 执行 `tmux select-window -t <target>` + `tmux select-pane -t <target>` 切换到目标 pane
3. **`YabaiController`** — 通过 `tmux list-clients` 找到客户端 PID → 进程树找到终端窗口 PID → `yabai -m window --focus <id>` 聚焦窗口

---

## 四、Strategy 2：各终端专属方案

每个终端的定位方式不同，利用其独特的 AppleScript API 或 CLI 能力实现精确 tab/pane 定位。

### 4.1 iTerm2 — AppleScript + TTY 匹配

**精确匹配：** 通过 TTY 设备号

```applescript
set targetTTY to do shell script "ps -o tty= -p <pid>"
tell application "iTerm2"
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                if tty of s contains targetTTY then
                    select t      -- 切换 tab
                    select s      -- 切换 session
                    set index of w to 1  -- 窗口置前
                    activate
                end if
            end repeat
        end repeat
    end repeat
end tell
```

**回退方案：** 如果 TTY 匹配失败，用目录名匹配 session name/path。

### 4.2 Terminal.app — AppleScript + 标题/历史匹配

```applescript
tell application "Terminal"
    repeat with w in windows
        repeat with t in tabs of w
            if custom title of t contains "<dir>" or history of t contains "<dir>" then
                set selected tab of w to t
                set frontmost of w to true
                activate
            end if
        end repeat
    end repeat
end tell
```

匹配 tab 的 `custom title` 或 `history` 内容中是否包含项目目录名。

### 4.3 Ghostty — AppleScript + 工作目录匹配

```applescript
tell application "Ghostty"
    set matches to every terminal whose working directory contains "<cwd>"
    if (count of matches) > 0 then
        focus (item 1 of matches)
    end if
    activate
end tell
```

Ghostty 的 AppleScript API 直接支持 `working directory` 属性，非常优雅。

### 4.4 cmux — CLI 命令

```bash
cmux find-window --content --select <dir-name>
```

然后通过 AppleScript 激活 cmux 应用。

### 4.5 Kitty — 远程控制 API

```bash
kitty @ focus-window --match "cwd:<cwd>"
```

利用 Kitty 的远程控制协议，按工作目录精确匹配。

### 4.6 WezTerm — CLI 查询

```bash
wezterm cli list --format json
# 检查输出中的 cwd，然后激活应用
```

---

## 五、Strategy 3：通用回退

对于没有专属方案的终端（Warp、Alacritty、VS Code、Cursor、Zed 等）：

### 5.1 通过 Bundle ID 激活应用

```swift
NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
    .first?.activate()
```

### 5.2 最终兜底

如果连终端名都没检测到，按优先级依次尝试激活常见终端：

```
cmux → Ghostty → Warp → iTerm2 → Terminal.app
```

---

## 六、各终端定位能力对比

| 终端 | 定位方式 | 匹配策略 | 精确度 |
|------|---------|---------|--------|
| tmux + Yabai | tmux CLI + yabai | Pane PID 映射 + cwd | Tab + Pane 级 |
| iTerm2 | AppleScript | TTY 设备号 / Session 名称 | Tab + Session 级 |
| Terminal.app | AppleScript | Tab 标题 / 历史内容 | Tab 级 |
| Ghostty | AppleScript | 工作目录 | Tab 级 |
| cmux | CLI | `find-window --content` | Tab 级 |
| Kitty | CLI 远程控制 | `cwd:` 匹配 | Tab 级 |
| WezTerm | CLI | `cli list` + cwd | Tab 级 |
| Warp | Bundle ID | 仅激活应用 | 应用级 |
| Alacritty | Bundle ID | 仅激活应用 | 应用级 |
| VS Code | Bundle ID | 仅激活应用 | 应用级 |
| Cursor | Bundle ID | 仅激活应用 | 应用级 |
| Zed | Bundle ID | 仅激活应用 | 应用级 |

---

## 七、完整数据流

```
用户在刘海面板点击"跳转"按钮
         │
         ↓
ChatView / ClaudeInstancesView 触发 focusSession()
         │
         ↓
TerminalJumper.jump(to: session)
  │ 提取: cwd, pid, terminalApp, isInTmux
  │
  ├── 是 tmux 会话？
  │     ├─ TmuxTargetFinder.findTarget()  → 定位 session:window.pane
  │     ├─ TmuxController.switchToPane()  → tmux select-window/pane
  │     ├─ findTmuxClientTerminal()       → 找到终端窗口 PID
  │     └─ WindowFocuser.focusTmuxWindow() → yabai --focus
  │
  ├── iTerm2？  → jumpViaiTerm2()     → TTY 匹配 / Session 名称匹配
  ├── Terminal?  → jumpViaTerminalApp() → 标题/历史匹配
  ├── cmux？    → jumpViaCmux()        → find-window --select
  ├── Ghostty？ → jumpViaGhostty()     → working directory 匹配
  ├── Kitty？   → jumpViaKitty()       → @ focus-window --match cwd
  ├── WezTerm？ → jumpViaWezTerm()     → cli list + activate
  │
  ├── 有 terminalApp 名称？
  │     └─ activateByBundleId()  → NSRunningApplication.activate()
  │
  └── 全部失败？
        └─ 按优先级尝试: cmux → Ghostty → Warp → iTerm2 → Terminal.app
```

---

## 八、核心文件清单

| 文件 | 职责 |
|------|------|
| `TerminalJumper.swift` | 跳转编排器，串联所有策略 |
| `TerminalAppRegistry.swift` | 终端名 ↔ Bundle ID 注册表 |
| `ProcessTreeBuilder.swift` | 进程树构建 + 终端检测 + tmux 检测 |
| `TmuxTargetFinder.swift` | tmux pane 精确定位 |
| `TmuxController.swift` | 高层 tmux 操作（select-window/pane） |
| `YabaiController.swift` | tmux + yabai 窗口聚焦 |
| `WindowFinder.swift` | 查询 yabai 窗口信息 |
| `WindowFocuser.swift` | 通过 yabai 聚焦窗口 |
| `TerminalVisibilityDetector.swift` | 检测终端是否在前台/可见 |
| `SessionStore.swift` | 会话状态管理，触发终端检测 |
| `SessionState.swift` | 会话数据模型（pid, tty, terminalApp, isInTmux） |

---

## 九、设计亮点

1. **分层回退**：从最精确（tmux pane 级别）到最粗粒度（仅激活应用），确保总能跳转到某个地方
2. **终端专属优化**：对主流终端利用其独特的 AppleScript API 或 CLI 能力实现精确 tab/pane 定位
3. **进程树分析**：通过 PID 父子关系自动检测终端类型，无需用户手动配置
4. **TTY 匹配**：利用 Unix TTY 设备号实现唯一映射，是 iTerm2 方案的核心
5. **务实取舍**：对不支持精确匹配的终端，优雅降级到应用级激活而非强行实现
