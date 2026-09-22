"""Server-owned forced SSH command. Configuration is installed from data1.yml.

The deploy key has no shell, forwarding, or database access. Releases never replace
runtime data. Database migrations require an independent reviewed release.
"""
import hashlib
import http.client
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from urllib.parse import urlparse

ROOTS = {'server', 'shared', 'src', 'scripts', 'config', 'public', 'dist'}
FILES = {'package.json', 'package-lock.json', 'index.html', 'vite.config.js',
         'tailwind.config.js', 'postcss.config.js'}


def command(value):
    match = re.fullmatch(r'deploy ([a-f0-9]{40}) ([a-f0-9]{64})', value)
    if not match:
        raise ValueError('Only a verified deployment command is allowed')
    return match.groups()


def validate_member(member):
    path = PurePosixPath(member.name)
    if path.is_absolute() or not path.parts or any(p.startswith('.') for p in path.parts):
        raise ValueError('Unsafe archive path')
    if path.parts[0] not in ROOTS and member.name not in FILES:
        raise ValueError('Unapproved archive path')
    if not member.isfile() and not member.isdir():
        raise ValueError('Archive links and devices are prohibited')
    if path.parts[0] == 'dist' and (len(path.parts) < 2 or path.parts[1] not in {'domain', 'mdarj'}):
        raise ValueError('Unexpected build target')
    if path.parts[:2] == ('public', 'downloads'):
        raise ValueError('Native downloads are managed independently')


def run(args, cwd=None):
    # Avoid printing service environment variables or npm configuration.
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1])
    return result.stdout


def receive(stream, destination, expected):
    digest = hashlib.sha256()
    size = 0
    with destination.open('xb') as output:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > 1024 * 1024 * 1024:
                raise ValueError('Release exceeds size limit')
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected:
        raise ValueError('Release checksum mismatch')


def unpack(archive, destination):
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if sum(m.size for m in members) > 3 * 1024 * 1024 * 1024:
            raise ValueError('Expanded release exceeds size limit')
        names = set()
        for member in members:
            validate_member(member)
            if member.name in names:
                raise ValueError('Duplicate archive entry')
            names.add(member.name)
        # Links are prohibited and destination is a fresh directory.
        for member in members:
            target = destination / member.name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def prepare_dependencies(release, config):
    digest = hashlib.sha256((release / 'package-lock.json').read_bytes()).hexdigest()
    folder = Path(config['dependency_cache']) / digest
    if not (folder / '.ready').is_file():
        folder.mkdir(parents=True, exist_ok=True)
        for name in ('package.json', 'package-lock.json'):
            shutil.copyfile(release / name, folder / name)
        run(['npm', 'ci', '--omit=dev', '--no-audit', '--no-fund'], folder)
        run(['npx', '--no-install', 'playwright', 'install', 'chromium'], folder)
        (folder / '.ready').write_text(digest)
    (release / 'node_modules').symlink_to(folder / 'node_modules')
    run(['node', '--input-type=module', '-e',
         "import { chromium } from 'playwright'; const b=await chromium.launch({headless:true}); await b.close();"], release)


def health(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'AlhabibMap-Release-Verification'})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200 or not json.load(response).get('ok'):
            raise RuntimeError('Health check failed')


def switch(current, target):
    temporary = current.with_name(current.name + '.github-next')
    temporary.symlink_to(target)
    temporary.replace(current)


def wait_for_health(url):
    for attempt in range(30):
        try:
            health(url)
            return
        except Exception:
            if attempt == 29:
                raise
            time.sleep(1)


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'script' and attrs.get('src'):
            self.urls.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') in {'stylesheet', 'modulepreload'}:
            self.urls.append(attrs['href'])


def fetch(base, relative=''):
    # The origin comes only from server-owned configuration, never HTML content.
    if relative and (not re.fullmatch(r'[A-Za-z0-9_./-]+', relative) or '..' in relative or relative.startswith('/')):
        raise ValueError('Invalid asset path')
    origin = urlparse(base)
    if origin.scheme not in {'http', 'https'} or not origin.hostname or origin.username:
        raise ValueError('Invalid configured website origin')
    connection_type = http.client.HTTPSConnection if origin.scheme == 'https' else http.client.HTTPConnection
    connection = connection_type(origin.hostname, origin.port, timeout=30)
    try:
        path = origin.path + relative
        if not relative:
            path += '?release=' + str(time.time_ns())
        connection.request('GET', path, headers={'Cache-Control': 'no-cache', 'User-Agent': 'AlhabibMap-Release-Verification'})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError('Asset probe failed; redirects are not followed')
        return response.read()
    finally:
        connection.close()


def verify_public_files(release, config):
    for target in config['public_checks']:
        base, folder = target['url'], release / target['directory']
        html = fetch(base)
        html = re.sub(rb'<script\b[^>]*src="https://static\.cloudflareinsights\.com/beacon\.min\.js/[^\"]+"[^>]*></script>\s*', b'', html)
        if html != (folder / 'index.html').read_bytes():
            raise RuntimeError('Published HTML does not match release')
        parser = Assets()
        parser.feed((folder / 'index.html').read_text())
        for asset in parser.urls:
            parsed = urlparse(asset)
            if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
                raise ValueError('Only local built assets can be verified')
            relative = parsed.path.removeprefix(urlparse(base).path)
            if fetch(base, relative) != (folder / relative).read_bytes():
                raise RuntimeError('Published asset does not match release')


def activate(release, config):
    current = Path(config['current'])
    previous = current.resolve(strict=True)
    services = config['services']
    try:
        run(['pm2', 'stop', *services[1:]])
        run(['pm2', 'stop', services[0]])
        switch(current, release)
        run(['pm2', 'restart', *services, '--update-env'])
        for url in config['health_urls']:
            wait_for_health(url)
        live = json.loads(run(['pm2', 'jlist']))
        for name in services:
            if not any(p['name'] == name and p['pm2_env']['status'] == 'online' for p in live):
                raise RuntimeError('Service did not start')
        verify_public_files(release, config)
        (release / 'previous-release.txt').write_text(str(previous))
    except Exception:
        if current.resolve() != previous:
            switch(current, previous)
        run(['pm2', 'restart', *services, '--update-env'])
        raise


def prune_releases(config, current):
    root = Path(config['release_root']).resolve(strict=True)
    previous = Path((current / 'previous-release.txt').read_text()).resolve(strict=True)
    protected = [current, previous, Path(config['runtime_source']).resolve(), Path(config['env_source']).resolve()]
    for candidate in root.iterdir():
        if not re.fullmatch(r'github-\d{8}-\d{6}-[a-f0-9]{12}', candidate.name) or candidate.is_symlink():
            continue
        if any(path == candidate or candidate in path.parents for path in protected):
            continue
        if candidate.is_dir() and (candidate / 'github-release.json').is_file():
            shutil.rmtree(candidate)


def deploy(config, sha, digest):
    with tempfile.TemporaryDirectory(prefix='github-web-', dir=config['release_root']) as staging:
        archive = Path(staging) / 'release.tar.gz'
        receive(sys.stdin.buffer, archive, digest)
        release = Path(config['release_root']) / ('github-' + time.strftime('%Y%m%d-%H%M%S') + '-' + sha[:12])
        release.mkdir()
        unpack(archive, release)
        print('PACKAGE_VERIFIED', flush=True)
        (release / '.env').symlink_to(Path(config['env_source']).resolve(strict=True))
        (release / 'runtime').symlink_to(Path(config['runtime_source']).resolve(strict=True))
        prepare_dependencies(release, config)
        print('DEPENDENCIES_VERIFIED', flush=True)
        # Use server-owned preflight, not code supplied by the archive.
        run(['node', config['preflight'], str(release), config['config_path']])
        print('PREFLIGHT_PASSED', flush=True)
        (release / 'github-release.json').write_text(json.dumps({'sha': sha, 'sha256': digest}))
        activate(release, config)
        print('DEPLOYED', sha, flush=True)
        prune_releases(config, release)


def main():
    import fcntl  # Linux server only; pure validation functions are portable.
    config_path = Path(__file__).with_name('config.json')
    config = json.loads(config_path.read_text())
    config['config_path'] = str(config_path)
    sha, digest = command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    with config_path.with_suffix('.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            deploy(config, sha, digest)
        except Exception as error:
            config_path.with_suffix('.error').write_text(type(error).__name__ + ': ' + str(error))
            raise


if __name__ == '__main__':
    main()
