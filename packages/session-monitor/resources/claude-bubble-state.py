import json
import socket
import sys
import os

SOCKET_PATH = '/tmp/claude-bubble.sock'

def log(msg):
    with open('/tmp/claude-bubble-hook.log', 'a') as f:
        f.write(msg + '\n')

def main():
    event_raw = sys.stdin.read().strip()
    if not event_raw:
        return

    log(f'[hook] raw: {event_raw[:100]}')

    try:
        event = json.loads(event_raw)
    except json.JSONDecodeError:
        log('[hook] JSON decode error')
        return

    hook_name = event.get('hook_event_name', 'unknown')
    session_id = event.get('session_id', '')
    cwd = event.get('cwd', '')

    log(f'[hook] {hook_name} session={session_id}')

    if not os.path.exists(SOCKET_PATH):
        log('[hook] socket not exists')
        # Socket not available, just exit without output (auto-allow by default)
        return

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(SOCKET_PATH)
        message = {
            'hook_event_name': hook_name,
            'session_id': session_id,
            'cwd': cwd,
            'payload': event
        }
        sock.sendall((json.dumps(message) + '\n').encode('utf-8'))
        log(f'[hook] sent {hook_name}')

        # PermissionRequest requires response from user (blocking)
        if hook_name == 'PermissionRequest':
            # Wait for decision from Bubble app
            data = b''
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                data += chunk
                if b'\n' in data:
                    break

            if data:
                response = json.loads(data.decode('utf-8'))
                decision = response.get('decision', 'allow')
                reason = response.get('reason')
                log(f'[hook] PermissionRequest decision={decision} reason={reason}')

                if decision == 'allow':
                    print(json.dumps({
                        'hookSpecificOutput': {
                            'hookEventName': 'PermissionRequest',
                            'decision': {'behavior': 'allow'}
                        }
                    }))
                elif decision == 'deny':
                    decision_obj = {'behavior': 'deny'}
                    if reason:
                        decision_obj['message'] = reason
                    print(json.dumps({
                        'hookSpecificOutput': {
                            'hookEventName': 'PermissionRequest',
                            'decision': decision_obj
                        }
                    }))
                else:
                    # Unknown decision - let Claude show its UI
                    log('[hook] unknown decision, exiting without output')
            else:
                log('[hook] PermissionRequest no response, auto-allow')
                print(json.dumps({
                    'hookSpecificOutput': {
                        'hookEventName': 'PermissionRequest',
                        'decision': {'behavior': 'allow'}
                    }
                }))
        # All other events: fire-and-forget, no output needed (auto-allow by default)
    except Exception as e:
        log(f'[hook] error: {e}')
    finally:
        sock.close()

if __name__ == '__main__':
    main()
