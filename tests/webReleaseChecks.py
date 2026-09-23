import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1] / 'scripts/web-release/receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class ReleaseTests(unittest.TestCase):
    def test_beacon_filter_preserves_application_html_exactly(self):
        prefix = '<html>مرحبا\r\n<script src="/assets/app.js"></script>\n'.encode('utf-8')
        beacon = b'<script defer src="https://static.cloudflareinsights.com/beacon.min.js/abc" data-token="test"></script>\r\n  '
        self.assertEqual(receiver.strip_cloudflare_beacon(prefix + beacon + b'</html>'), prefix + b'</html>')
        for script in [b'<script src="https://example.test/app.js"></script>',
                       b'<script src="https://static.cloudflareinsights.com/beacon.min.js/abc">app()</script>',
                       b'<script src="https://static.cloudflareinsights.com/beacon.min.js/abc">',
                       b'<!-- <script src="https://static.cloudflareinsights.com/beacon.min.js/abc"></script> -->']:
            self.assertEqual(receiver.strip_cloudflare_beacon(script), script)
        self.assertEqual(receiver.strip_cloudflare_beacon(beacon + prefix + beacon), prefix)

    def test_beacon_filter_handles_large_repeated_attributes_without_backtracking(self):
        attributes = b' data-src="https://static.cloudflareinsights.com/beacon.min.js/abc"' * 20000
        html = b'<script' + attributes + b'></script>'
        self.assertEqual(receiver.strip_cloudflare_beacon(html), html)
        incomplete = b'<script' + attributes + b'>'
        self.assertEqual(receiver.strip_cloudflare_beacon(incomplete), incomplete)

    def test_asset_probe_rejects_external_urls_and_path_escape(self):
        with patch.object(receiver.http.client, 'HTTPSConnection') as opener:
            for path in ['https://evil.test/file', '//evil.test/file', '../private', 'assets/%2e%2e/private', '/private']:
                with self.assertRaises(ValueError):
                    receiver.fetch('https://example.test/', path)
            opener.assert_not_called()
        with patch.object(receiver.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value.status = 302
            with self.assertRaises(ValueError):
                receiver.fetch('https://example.test/')
            connection.assert_called_once_with('example.test', None, timeout=30)

    def test_health_uses_release_identity_for_edge_filtering(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"ok":true}'
        with patch.object(receiver.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = response
            receiver.health('https://example.test/api/health')
            headers = connection.return_value.request.call_args.kwargs['headers']
            self.assertEqual(headers['User-Agent'], 'AlhabibMap-Release-Verification')

    def test_command_is_not_a_shell(self):
        self.assertEqual(receiver.command('deploy ' + 'a' * 40 + ' ' + 'b' * 64), ('a' * 40, 'b' * 64))
        for command in ['bash', 'deploy ../../bad x', 'deploy ' + 'a' * 40 + ' ' + 'b' * 64 + ';id']:
            with self.assertRaises(ValueError):
                receiver.command(command)

    def test_archive_cannot_replace_data_or_escape(self):
        for name in ['../.env', '/etc/passwd', '.env', 'runtime/session', 'public/../.env', 'dist/other/index.html', 'public/downloads/app.apk', 'public/..\\secret', 'public/file:stream']:
            member = tarfile.TarInfo(name)
            with self.assertRaises(ValueError):
                receiver.validate_member(member)
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE]:
            member = tarfile.TarInfo('server/link')
            member.type = kind
            with self.assertRaises(ValueError):
                receiver.validate_member(member)
        receiver.validate_member(tarfile.TarInfo('dist/domain/index.html'))

    def test_corrupt_transfer_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            stream = io.BytesIO(b'changed')
            destination = Path(folder) / 'archive'
            digest = hashlib.sha256(b'original').hexdigest()
            with self.assertRaises(ValueError):
                receiver.receive(stream, destination, digest)

    def test_failed_health_restores_previous_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            previous, release, current = root / 'previous', root / 'new', root / 'current'
            previous.mkdir()
            release.mkdir()
            active = [previous]
            resolve = Path.resolve
            def resolve_current(path, *args, **kwargs):
                return active[0] if path == current else resolve(path, *args, **kwargs)
            def switch_current(path, target):
                self.assertEqual(path, current)
                active[0] = target
            config = {'release_root': str(root), 'current': str(current), 'services': ['api', 'worker'], 'health_urls': ['https://example.test/health']}
            with patch.object(Path, 'resolve', resolve_current), patch.object(receiver, 'switch', side_effect=switch_current) as switch, patch.object(receiver, 'run', return_value=json.dumps([])) as run, patch.object(receiver.time, 'sleep'), patch.object(receiver, 'health', side_effect=RuntimeError('unhealthy')):
                with self.assertRaises(RuntimeError):
                    receiver.activate(release, config)
                self.assertEqual(current.resolve(), previous)
                self.assertEqual(switch.call_count, 2)
                self.assertEqual(run.call_args.args[0], ['pm2', 'restart', 'api', 'worker', '--update-env'])

    def test_cleanup_retains_current_previous_and_runtime_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            releases = []
            for number in range(4):
                release = root / ('github-20260922-12000' + str(number) + '-aaaaaaaaaaaa')
                release.mkdir()
                (release / 'github-release.json').write_text('{}')
                releases.append(release)
            current, previous, data_owner, obsolete = releases
            runtime = data_owner / 'runtime'
            runtime.mkdir()
            (runtime / 'student-data').write_text('preserved')
            # Cleanup trusts the in-memory activation result, never a file-selected path.
            (current / 'previous-release.txt').write_text('/untrusted/private/path')
            legacy = root / 'legacy-release'
            legacy.mkdir()
            receiver.prune_releases({'release_root': str(root), 'runtime_source': str(runtime), 'env_source': str(root / 'shared.env')}, current, previous)
            self.assertFalse(obsolete.exists())
            self.assertTrue(current.exists() and previous.exists() and legacy.exists())
            self.assertEqual((runtime / 'student-data').read_text(), 'preserved')

    def test_deploy_revalidates_identifiers_before_any_filesystem_access(self):
        with patch.object(receiver.tempfile, 'TemporaryDirectory') as staging:
            for sha, digest in [('../' * 20, 'b' * 64), ('a' * 40, '../bad'), ('-option', 'b' * 64)]:
                with self.assertRaises(ValueError):
                    receiver.deploy({}, sha, digest)
            staging.assert_not_called()

    def test_paths_outside_release_root_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            releases = root / 'releases'
            releases.mkdir()
            outside = root / 'outside'
            outside.mkdir()
            config = {'release_root': str(releases)}
            with patch.object(receiver, 'run') as run:
                for candidate in [outside, releases, releases / '..' / 'outside']:
                    with self.assertRaises(ValueError):
                        receiver.prepare_dependencies(candidate, config)
                    with self.assertRaises(ValueError):
                        receiver.activate(candidate, config)
                    with self.assertRaises(ValueError):
                        receiver.prune_releases(config, candidate, outside)
                run.assert_not_called()

    def test_dependency_cache_symlink_cannot_write_outside_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            release, cache, outside = root / 'release', root / 'cache', root / 'outside'
            for path in (release, cache, outside):
                path.mkdir()
            (release / 'package-lock.json').write_text('{}')
            (release / 'package.json').write_text('{}')
            digest = hashlib.sha256(b'{}').hexdigest()
            # Model a pre-existing malicious link without requiring Windows symlink privileges.
            original = Path.is_symlink
            with patch.object(Path, 'is_symlink', lambda path: path == cache / digest or original(path)):
                with patch.object(receiver, 'run') as run:
                    with self.assertRaises(ValueError):
                        receiver.prepare_dependencies(release, {'release_root': str(root), 'dependency_cache': str(cache)})
                    run.assert_not_called()
            self.assertEqual(list(outside.iterdir()), [])

    def test_command_arguments_are_allowlisted_before_subprocess(self):
        with patch.object(receiver.subprocess, 'run') as execute:
            for args in [['sh', '-c', 'id'], ['npm', 'ci'], ['node', '-e', 'untrusted'],
                         ['pm2', 'stop', '--all'], ['pm2', 'restart', 'api;id'], ['pm2', 'stop', '../api']]:
                with self.assertRaises(ValueError):
                    receiver.run(args)
            execute.assert_not_called()
        with patch.object(receiver.shutil, 'which', return_value='/usr/bin/pm2'), patch.object(receiver.subprocess, 'run') as execute:
            execute.return_value.returncode = 0
            receiver.run(['pm2', 'restart', 'api', 'worker', '--update-env'])
            self.assertFalse(execute.call_args.kwargs['shell'])
            self.assertEqual(execute.call_args.args[0], ['/usr/bin/pm2', 'restart', 'api', 'worker', '--update-env'])

    def test_dependency_installation_disables_lifecycle_scripts(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            release = root / 'release'
            release.mkdir()
            for name in ('package.json', 'package-lock.json'):
                (release / name).write_text('{}')
            with patch.object(receiver, 'run') as run, patch.object(Path, 'symlink_to'):
                receiver.prepare_dependencies(release, {'release_root': str(root), 'dependency_cache': str(root / 'cache')})
            self.assertEqual(run.call_args_list[0].args[0], ['npm', 'ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'])

    def test_unpack_preserves_approved_files_and_rejects_linked_parent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            destination = root / 'release'
            destination.mkdir()
            archive = root / 'archive.tar'
            with tarfile.open(archive, 'w') as tar:
                member = tarfile.TarInfo('server/index.js')
                member.size = 4
                tar.addfile(member, io.BytesIO(b'safe'))
            original = Path.is_symlink
            with patch.object(Path, 'is_symlink', lambda path: path == destination / 'server' or original(path)):
                with self.assertRaises(ValueError):
                    receiver.unpack(archive, destination)
            receiver.unpack(archive, destination)
            self.assertEqual((destination / 'server/index.js').read_bytes(), b'safe')


if __name__ == '__main__':
    unittest.main()
