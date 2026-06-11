import json
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent
env_path = root / '.env.local'
if not env_path.exists():
    raise SystemExit('.env.local missing')

env = {}
with env_path.open('r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip()
        if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
            v = v[1:-1]
        env[k] = v

if 'DISCORD_BOT_TOKEN' not in env:
    raise SystemExit('DISCORD_BOT_TOKEN missing')

headers = {
    'Authorization': f'Bot {env["DISCORD_BOT_TOKEN"]}',
    'User-Agent': 'DiscordBot (https://example.com, 1.0)'
}

print('Fetching production gallery API...')
with urllib.request.urlopen('https://postavy-redm.vercel.app/api/discord-gallery', timeout=20) as rsp:
    gallery = json.load(rsp)
print('gallery photos', len(gallery.get('photos', [])))
for i, photo in enumerate(gallery.get('photos', [])[:5], 1):
    print('PHOTO', i, photo.get('id'))
    for key in ('url', 'proxyUrl'):
        url = photo.get(key)
        print(' ', key, url)
        if not url:
            continue
        for method in ('HEAD', 'GET'):
            try:
                req = urllib.request.Request(url, method=method, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=20) as r:
                    print('   ', method, r.status)
            except Exception as e:
                code = getattr(e, 'code', None)
                print('   ', method, 'ERROR', type(e).__name__, code or str(e))

print('\nFetching Discord messages directly...')
req = urllib.request.Request(
    'https://discord.com/api/v10/channels/1505429527021621278/messages?limit=5',
    headers=headers
)
with urllib.request.urlopen(req, timeout=20) as rsp:
    messages = json.load(rsp)
print('messages', len(messages))
for msg in messages:
    print('MSG', msg['id'], 'attachments', len(msg.get('attachments', [])))
    for att in msg.get('attachments', []):
        print('  ATT', att.get('id'), att.get('filename'), att.get('content_type'))
        print('    url', att.get('url'))
        print('    proxy', att.get('proxy_url'))
        for method in ('HEAD', 'GET'):
            for current_url in (att.get('url'), att.get('proxy_url')):
                if not current_url:
                    continue
                try:
                    req = urllib.request.Request(current_url, method=method, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=20) as r:
                        print('      ', method, current_url, r.status)
                except Exception as e:
                    code = getattr(e, 'code', None)
                    print('      ', method, current_url, 'ERROR', type(e).__name__, code or str(e))
