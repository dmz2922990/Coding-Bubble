import json
import socket
import sys
import os

SOCKET_PATH = '/tmp/claude-bubble.sock'

# Events that expect hookSpecificOutput in stdout
RESPONSE_EVENTS = {'PreToolUse', 'PostToolUse', 'PermissionRequest'}

def output_allow():
    print(json.dumps({
        'hookSpecificOutput': {
            'shouldDeny': False,
            'allowance': 'allow'
        }
    }))

def main():
    event_raw = sys.stdin.read().strip()
    if not event_raw:
        return
    try:
        event = json.loads(event_raw)
    except json.JSONDecodeError:
        return

    hook_name = event.get('hook_event_name', 'unknown')
    session_id = event.get('session_id', '')
    cwd = event.get('cwd', '')

    if not os.path.exists(SOCKET_PATH):
        # Only output for events that expect a response
        if hook_name in RESPONSE_EVENTS:
            output_allow()
        return

    message = {
        'hook_event_name': hook_name,
        'session_id': session_id,
        'cwd': cwd,
        'payload': event
    }

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCKET_PATH)
    try:
        sock.sendall((json.dumps(message) + '\n').encode('utf-8'))

        if hook_name == 'PermissionRequest':
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
                print(json.dumps({
                    'hookSpecificOutput': {
                        'shouldDeny': decision == 'deny',
                        'allowance': 'allow' if decision == 'allow' else 'deny',
                        'reason': reason
                    }
                }))
            else:
                output_allow()
    finally:
        sock.close()

if __name__ == '__main__':
    main()
