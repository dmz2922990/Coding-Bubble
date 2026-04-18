#!/usr/bin/env node

const { exec } = require('child_process');
const { createServer } = require('net');
const { writeFileSync } = require('fs');

// 测试钩子脚本
const testHookScript = async () => {
  // 创建一个模拟的 socket 服务器
  const server = createServer((socket) => {
    console.log('[Test] Socket connected');

    socket.on('data', (data) => {
      const message = data.toString();
      console.log('[Test] Received message:', message);

      // 模拟 PermissionRequest 响应
      if (message.includes('PermissionRequest')) {
        const response = {
          decision: 'allow',
          reason: 'Test allow'
        };
        socket.write(JSON.stringify(response) + '\n');
        console.log('[Test] Sent allow response');
      }

      socket.end();
    });
  });

  const socketPath = '/tmp/claude-bubble-test.sock';

  // 清理可能存在的 socket
  try {
    const fs = require('fs');
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  } catch (e) {}

  // 启动服务器
  server.listen(socketPath, () => {
    console.log(`[Test] Server listening on ${socketPath}`);

    // 创建测试事件
    const testEvent = {
      hook_event_name: 'PermissionRequest',
      session_id: 'test-session-123',
      cwd: '/test/path',
      payload: {
        tool_name: 'test-tool',
        tool_input: { test: true }
      }
    };

    // 使用 cat 传递输入给钩子脚本
    const process = exec(`node packages/session-monitor/resources/claude-bubble-state.ts`, (error, stdout, stderr) => {
      if (error) {
        console.error('[Test] Error:', error);
        return;
      }

      console.log('[Test] stdout:', stdout);
      console.log('[Test] stderr:', stderr);

      // 关闭服务器
      server.close();
    });

    // 写入测试事件
    process.stdin.write(JSON.stringify(testEvent) + '\n');
    process.stdin.end();
  });

  server.on('error', (err) => {
    console.error('[Test] Server error:', err);
  });
};

// 测试非 PermissionRequest 事件
const testNonPermissionEvent = async () => {
  console.log('\n[Test] Testing non-PermissionRequest event...');

  const testEvent = {
    hook_event_name: 'ToolUse',
    session_id: 'test-session-456',
    cwd: '/test/path',
    payload: {
      tool: 'echo',
      input: { test: true }
    }
  };

  const process = exec(`node packages/session-monitor/resources/claude-bubble-state.ts`, (error, stdout, stderr) => {
    console.log('[Test] ToolUse stdout:', stdout);
    console.log('[Test] ToolUse stderr:', stderr);
    console.log('[Test] ToolUse exit code:', error ? error.code : '0');
  });

  process.stdin.write(JSON.stringify(testEvent) + '\n');
  process.stdin.end();
};

// 测试无效 JSON
const testInvalidJson = async () => {
  console.log('\n[Test] Testing invalid JSON...');

  const process = exec(`node packages/session-monitor/resources/claude-bubble-state.ts`, (error, stdout, stderr) => {
    console.log('[Test] Invalid JSON stdout:', stdout);
    console.log('[Test] Invalid JSON stderr:', stderr);
    console.log('[Test] Invalid JSON exit code:', error ? error.code : '0');
  });

  process.stdin.write('invalid json content\n');
  process.stdin.end();
};

// 运行所有测试
const runAllTests = async () => {
  console.log('=== 开始测试钩子脚本 ===\n');

  // 测试 PermissionRequest
  await testHookScript();

  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 测试非 PermissionRequest
  await testNonPermissionEvent();

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试无效 JSON
  await testInvalidJson();

  console.log('\n=== 测试完成 ===');
};

runAllTests().catch(console.error);