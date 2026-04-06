import json
import socket
import sys
import os

SOCKET_PATH = '/tmp/claude-bubble.sock'

def main():
    event_raw = sys.stdin.read().strip()
    event = json.loads(event_raw)
    hook_name = event.get('hook_event_name', 'unknown')
    session_id = event.get('session_id', '')
    cwd = event.get('cwd', '')

    message = {
        'hook_event_name': hook_name,
        'session_id': session_id,
        'cwd': cwd,
        'payload': event
    }

    if not os.path.exists(SOCKET_PATH):
        # Socket not available — output default allow to not block Claude
        print(json.dumps({
            'hookSpecificOutput': {
                'shouldDeny': False,
                'allowance': 'allow'
            }
        }))
        return

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCKET_PATH)
    try:
        sock.sendall((json.dumps(message) + '\n').encode('utf-8'))

        if hook_name == 'PermissionRequest':
            # Block and wait for decision
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
                # Connection closed without response — default allow
                print(json.dumps({
                    'hookSpecificOutput': {
                        'shouldDeny': False,
                        'allowance': 'allow'
                    }
                }))
        # For non-PermissionRequest, just send event and close
    finally:
        sock.close()

if __name__ == '__main__':
    main()
