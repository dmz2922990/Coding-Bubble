#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function getSocketPath() {
    if (process.platform === 'win32') {
        return '\\\\.\\pipe\\claude-bubble';
    }
    return path.join(os.tmpdir(), 'claude-bubble.sock');
}
function getLogPath() {
    return path.join(os.tmpdir(), 'claude-bubble-hook.log');
}
const SOCKET_PATH = getSocketPath();
const LOG_PATH = getLogPath();
// Stream sessions handle permissions via stream-json protocol,
// not hooks. Skip all hook processing for these processes.
if (process.env.CLAUDE_BUBBLE_SKIP_HOOK === '1') {
    process.exit(0);
}
function log(msg) {
    try {
        fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} - ${msg}\n`);
    }
    catch {
        // If logging fails, continue without crashing
    }
}
function main() {
    let eventRaw = '';
    try {
        const buf = fs.readFileSync(0, { encoding: 'utf8' });
        eventRaw = buf.trim();
    }
    catch {
        return;
    }
    if (!eventRaw)
        return;
    log(`[hook] raw: ${eventRaw.substring(0, 100)}`);
    let event;
    try {
        event = JSON.parse(eventRaw);
    }
    catch {
        log('[hook] JSON decode error');
        return;
    }
    const hookName = event.hook_event_name || 'unknown';
    const sessionId = event.session_id || '';
    const cwd = event.cwd || '';
    log(`[hook] ${hookName} session=${sessionId}`);
    // On Windows, named pipes are always "exists" conceptually,
    // so we skip the existsSync check and let connect handle errors.
    if (process.platform !== 'win32' && !fs.existsSync(SOCKET_PATH)) {
        log('[hook] socket not exists');
        return;
    }
    const sock = net.createConnection(SOCKET_PATH);
    sock.on('connect', () => {
        const message = JSON.stringify({
            hook_event_name: hookName,
            session_id: sessionId,
            cwd: cwd,
            pid: process.ppid,
            payload: event
        }) + '\n';
        sock.write(message);
        log(`[hook] sent ${hookName}`);
        if (hookName === 'PermissionRequest') {
            let data = '';
            sock.on('data', (chunk) => {
                data += chunk.toString('utf8');
                if (data.includes('\n')) {
                    try {
                        const response = JSON.parse(data.trim());
                        const decision = response.decision || 'allow';
                        const reason = response.reason || '';
                        log(`[hook] PermissionRequest decision=${decision} reason=${reason}`);
                        if (decision === 'allow') {
                            const output = {
                                hookSpecificOutput: {
                                    hookEventName: 'PermissionRequest',
                                    decision: { behavior: 'allow' }
                                }
                            };
                            if (response.updatedInput) {
                                output.hookSpecificOutput.decision.updatedInput = response.updatedInput;
                            }
                            console.log(JSON.stringify(output));
                            process.exit(0);
                        }
                        else if (decision === 'deny') {
                            const decisionObj = { behavior: 'deny' };
                            if (reason)
                                decisionObj.message = reason;
                            console.log(JSON.stringify({
                                hookSpecificOutput: {
                                    hookEventName: 'PermissionRequest',
                                    decision: decisionObj
                                }
                            }));
                            process.exit(0);
                        }
                        else {
                            log('[hook] unknown decision, exiting without output');
                            process.exit(0);
                        }
                    }
                    catch (err) {
                        log('[hook] Failed to parse response: ' + err);
                        process.exit(0);
                    }
                }
            });
        }
        else {
            sock.end();
        }
    });
    sock.on('error', (err) => {
        log(`[hook] error: ${err.message}`);
    });
}
main();
