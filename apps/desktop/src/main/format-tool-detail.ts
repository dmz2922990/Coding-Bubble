function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatToolDetail(toolName?: string, toolInput?: Record<string, unknown> | null): string {
  if (!toolName) return '已允许未知工具'
  const input = toolInput ?? {}
  const COLLAPSE_THRESHOLD = 200

  function fmtBody(text: string): string {
    const escaped = escapeHtml(text)
    if (text.length <= COLLAPSE_THRESHOLD) {
      return `<pre class="sys-detail">${escaped}</pre>`
    }
    return `<details><summary>变更详情</summary><pre class="sys-detail">${escaped}</pre></details>`
  }

  function fmtDiff(oldStr: string, newStr: string): string {
    const oldLines = oldStr.split('\n')
    const newLines = newStr.split('\n')

    let prefix = 0
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
      prefix++
    }

    let oEnd = oldLines.length - 1
    let nEnd = newLines.length - 1
    while (oEnd > prefix && nEnd > prefix && oldLines[oEnd] === newLines[nEnd]) {
      oEnd--
      nEnd--
    }

    const lines: Array<{ type: 'ctx' | 'rm' | 'add'; text: string }> = []
    for (let i = 0; i < prefix; i++) {
      lines.push({ type: 'ctx', text: oldLines[i] })
    }
    for (let i = prefix; i <= oEnd; i++) {
      lines.push({ type: 'rm', text: oldLines[i] })
    }
    for (let i = prefix; i <= nEnd; i++) {
      lines.push({ type: 'add', text: newLines[i] })
    }
    for (let i = oEnd + 1; i < oldLines.length; i++) {
      lines.push({ type: 'ctx', text: oldLines[i] })
    }

    const diffHtml = lines.map(l => {
      const marker = l.type === 'rm' ? '-' : l.type === 'add' ? '+' : ' '
      const escaped = escapeHtml(l.text)
      return `<span class="diff-${l.type === 'rm' ? 'rm' : l.type === 'add' ? 'add' : 'ctx'}">${marker} ${escaped}</span>`
    }).join('\n')

    const totalLen = lines.reduce((s, l) => s + l.text.length + 2, 0)
    if (totalLen <= COLLAPSE_THRESHOLD) {
      return `<pre class="sys-detail sys-detail--diff">${diffHtml}</pre>`
    }
    return `<details><summary>变更详情</summary><pre class="sys-detail sys-detail--diff">${diffHtml}</pre></details>`
  }

  switch (toolName) {
    case 'Bash': {
      const cmd = input.command as string ?? ''
      return `已允许: Bash${fmtBody(cmd)}`
    }
    case 'Edit': {
      const file = escapeHtml((input.file_path as string ?? '').split('/').pop() ?? '')
      const oldStr = input.old_string as string ?? ''
      const newStr = input.new_string as string ?? ''
      return `已允许: Edit <code>${file}</code>${fmtDiff(oldStr, newStr)}`
    }
    case 'Write': {
      const file = escapeHtml((input.file_path as string ?? '').split('/').pop() ?? '')
      const content = input.content as string ?? ''
      return `已允许: Write <code>${file}</code>${fmtBody(content)}`
    }
    case 'Read': {
      const file = escapeHtml((input.file_path as string ?? ''))
      return `已允许: Read <code>${file}</code>`
    }
    case 'Grep': {
      const pattern = escapeHtml((input.pattern as string ?? ''))
      const path = escapeHtml((input.path as string ?? ''))
      return `已允许: Grep <code>${pattern}</code> in <code>${path || '(default)'}</code>`
    }
    case 'Glob': {
      const pattern = escapeHtml((input.pattern as string ?? ''))
      return `已允许: Glob <code>${pattern}</code>`
    }
    case 'AskUserQuestion': {
      const questions = input.questions as Array<Record<string, unknown>> | undefined
      const q = questions?.[0]?.question as string ?? ''
      return `已允许: AskUserQuestion${fmtBody(q)}`
    }
    default: {
      const json = JSON.stringify(input)
      return `已允许: ${toolName}${fmtBody(json)}`
    }
  }
}
