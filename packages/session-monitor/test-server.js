const { createServer } = require('net');
const fs = require('fs');

const socketPath = '/tmp/claude-bubble-test.sock';

// 清理旧的 socket 文件
if (fs.existsSync(socketPath)) {
  fs.unlinkSync(socketPath);
}

console.log('Starting test server...');

const server = createServer((socket) => {
  console.log('Socket connected');

  let data = '';

  socket.on('data', (chunk) => {
    data += chunk.toString();

    if (data.includes('\n')) {
      try {
        const message = JSON.parse(data.trim());
        console.log('Received:', message);

        // 响应 PermissionRequest
        if (message.hook_event_name === 'PermissionRequest') {
          const response = {
            decision: 'allow',
            reason: 'Test response'
          };
          socket.write(JSON.stringify(response) + '\n');
          console.log('Sent allow response');
        }

        socket.end();
      } catch (e) {
        console.error('Error parsing JSON:', e);
        socket.end();
      }
    }
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

server.listen(socketPath, () => {
  console.log(`Server listening on ${socketPath}`);

  // 等待一下然后发送测试事件
  setTimeout(() => {
    const testEvent = {
      hook_event_name: 'PermissionRequest',
      session_id: 'test-session-123',
      cwd: '/test',
      payload: {
        tool_name: 'test-tool',
        tool_input: { test: true }
      }
    };

    console.log('Sending test event...');
    const testProcess = require('child_process').spawn('node', ['resources/claude-bubble-state.js']);

    testProcess.stdout.on('data', (data) => {
      console.log('Hook stdout:', data.toString());
    });

    testProcess.stderr.on('data', (data) => {
      console.log('Hook stderr:', data.toString());
    });

    testProcess.on('close', (code) => {
      console.log('Hook exited with code:', code);
      server.close();
    });

    testProcess.stdin.write(JSON.stringify(testEvent) + '\n');
    testProcess.stdin.end();
  }, 1000);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});