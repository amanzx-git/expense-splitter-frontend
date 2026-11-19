"""Run real frontend API integration against an isolated temporary PostgreSQL DB."""
import re
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse, parse_qs
from uuid import uuid4
from wsgiref.simple_server import make_server, WSGIRequestHandler, WSGIServer

frontend = Path(__file__).resolve().parents[1]
backend = frontend.parent / 'backend'
sys.path.insert(0, str(backend))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.core import mail
from django.core.wsgi import get_wsgi_application
from django.db import connection, connections
from django.test import override_settings
from django.test.utils import setup_databases, teardown_databases

class IntegrationServer(WSGIServer):
    request_queue_size = 128


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *args):
        pass  # Never print verification tokens, cookies, request bodies or account data.


def main():
    name = 'f10_integration_' + uuid4().hex[:16]
    connection.settings_dict['TEST']['NAME'] = name
    with override_settings(ALLOWED_HOSTS=['localhost', '127.0.0.1'], EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', SECURE_SSL_REDIRECT=False, SESSION_COOKIE_SECURE=False, CSRF_COOKIE_SECURE=False, CSRF_TRUSTED_ORIGINS=['http://localhost:5173']):
        old = setup_databases(verbosity=0, interactive=False)
        server = None
        try:
            with tempfile.TemporaryDirectory(prefix='splitter-f10-') as folder:
                settings.MEDIA_ROOT = Path(folder) / 'media'  # Isolate uploaded test photos.
                from PIL import Image
                photo_file = Path(folder) / 'photo.png'
                Image.new('RGB', (2, 2), 'blue').save(photo_file, format='PNG')
                tokens_file = Path(folder) / 'verification.json'
                stop_file = Path(folder) / 'stop'
                tokens_file.write_text('{}', encoding='utf-8')
                app = get_wsgi_application()
                def capture(environ, start_response):
                    response = app(environ, start_response)
                    tokens = {}
                    for message in getattr(mail, 'outbox', []):
                        for line in message.body.splitlines():
                            if '/verify-email?' in line:
                                query = parse_qs(urlparse(line.strip()).query)
                                tokens[message.to[0]] = {key: query[key][0] for key in ['uid', 'token']}
                                match = re.search(r'Your Splitter verification code\s+([0-9]{6})', message.body)
                                if match:
                                    tokens[message.to[0]].update(code=match[1], text=message.body, html=message.alternatives[0][0])
                    temporary = tokens_file.with_suffix('.tmp')
                    temporary.write_text(json.dumps(tokens), encoding='utf-8')
                    temporary.replace(tokens_file)
                    return response
                server = make_server('localhost', 0, capture, handler_class=QuietHandler, server_class=IntegrationServer)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                stopped = threading.Event()
                def stop_when_requested():
                    while not stopped.wait(.05):
                        if stop_file.exists():
                            server.shutdown()
                            server.server_close()
                            return
                threading.Thread(target=stop_when_requested, daemon=True).start()
                env = {**os.environ, 'LIVE_DJANGO_ORIGIN': f'http://localhost:{server.server_port}', 'LIVE_VERIFICATION_FILE': str(tokens_file), 'LIVE_STOP_FILE': str(stop_file), 'LIVE_PHOTO_FILE': str(photo_file), 'LIVE_TIMINGS_FILE': str(frontend / 'scripts' / 'registration-http-timing.json')}
                try:
                    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
                    result = subprocess.run([npm, 'exec', '--', 'vitest', 'run', '--config', 'scripts/vitest.live.config.js', *sys.argv[1:]], cwd=frontend, env=env)
                    return result.returncode
                finally:
                    stopped.set()
                    server.shutdown()
                    server.server_close()
        finally:
            connections.close_all()
            teardown_databases(old, verbosity=0)

if __name__ == '__main__':
    sys.exit(main())
