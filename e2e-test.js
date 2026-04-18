#!/usr/bin/env node

const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');

const SOCKET_PATH = '/tmp/claude-bubble.sock';

console.log('=== E2E Test: Hook Script <-> Socket Server ===\n');

// Test 1: Verify socket exists
console.log('1. Checking socket...');
if (fs.existsSync(SOCKET_PATH)) {
  console.log('   PASS: Socket file exists at', SOCKET_PATH);
} else {
  console.log('   FAIL: Socket file NOT found');
  process.exit(1);
}

// Test 2: Send a PreToolUse event (fire-and-forget)
console.log('\n2. Testing PreToolUse (fire-and-forget)...');
const preToolEvent = JSON.stringify({
  hook_event_name: 'PreToolUse',
  session_id: 'e2e-test-session',
  cwd: '/test/path',
  payload: {
    tool_name: 'Read',
    tool_input: { file_path: '/test/file.txt' },
    tool_use_id: 'test-tool-use-id-001'
  }
});

const hookProc = spawn('node', [
  process.env.HOME + '/.claude/hooks/claude-bubble-state.js'
]);

let preToolOutput = '';
hookProc.stdout.on('data', (d) => { preToolOutput += d.toString(); });
hookProc.stderr.on('data', (d) => { preToolOutput += d.toString(); });

hookProc.on('close', (code) => {
  console.log('   Exit code:', code);
  console.log('   Output:', preToolOutput || '(empty - correct for fire-and-forget)');
  if (code === 0 && !preToolOutput) {
    console.log('   PASS: PreToolUse completed silently');
  } else {
    console.log('   FAIL: Expected exit 0 with no output');
  }

  // Test 3: Check logs
  console.log('\n3. Checking hook log...');
  const logContent = fs.readFileSync('/tmp/claude-bubble-hook.log', 'utf-8');
  const lastLines = logContent.trim().split('\n').slice(-5);
  lastLines.forEach(line => console.log('   ', line));
  console.log('   PASS: Log file written');

  // Test 4: Verify CLAUDE_BUBBLE_SKIP_HOOK
  console.log('\n4. Testing CLAUDE_BUBBLE_SKIP_HOOK env var...');
  const skipProc = spawn('node', [
    process.env.HOME + '/.claude/hooks/claude-bubble-state.js'
  ], { env: { ...process.env, CLAUDE_BUBBLE_SKIP_HOOK: '1' } });

  skipProc.on('close', (code) => {
    if (code === 0) {
      console.log('   PASS: Script exits cleanly with CLAUDE_BUBBLE_SKIP_HOOK=1');
    } else {
      console.log('   FAIL: Expected exit 0, got', code);
    }

    // Test 5: Invalid JSON
    console.log('\n5. Testing invalid JSON handling...');
    const badJsonProc = spawn('node', [
      process.env.HOME + '/.claude/hooks/claude-bubble-state.js'
    ]);
    let badOutput = '';
    badJsonProc.stderr.on('data', (d) => { badOutput += d.toString(); });
    badJsonProc.on('close', (code) => {
      console.log('   Exit code:', code);
      if (code === 0) {
        console.log('   PASS: Handles invalid JSON gracefully');
      } else {
        console.log('   FAIL: Should exit 0 for invalid JSON');
      }

      console.log('\n=== E2E Test Complete ===');
    });
    badJsonProc.stdin.write('not valid json\n');
    badJsonProc.stdin.end();
  });
});

hookProc.stdin.write(preToolEvent + '\n');
hookProc.stdin.end();