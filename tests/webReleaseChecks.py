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
        with patch.object(receiver.urllib.request, 'urlopen') as open_url:
            open_url.return_value.__enter__.return_value = response
            receiver.health('https://example.test/api/health')
            request = open_url.call_args.args[0]
            self.assertEqual(request.get_header('User-agent'), 'AlhabibMap-Release-Verification')

    def test_command_is_not_a_shell(self):
        self.assertEqual(receiver.command('deploy ' + 'a' * 40 + ' ' + 'b' * 64), ('a' * 40, 'b' * 64))
        for command in ['bash', 'deploy ../../bad x', 'deploy ' + 'a' * 40 + ' ' + 'b' * 64 + ';id']:
            with self.assertRaises(ValueError):
                receiver.command(command)

    def test_archive_cannot_replace_data_or_escape(self):
        for name in ['../.env', '/etc/passwd', '.env', 'runtime/session', 'public/../.env', 'dist/other/index.html', 'public/downloads/app.apk']:
            with self.assertRaises(ValueError):
                receiver.validate_member(tarfile.TarInfo(name))
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE]:
            member = tarfile.TarInfo('server/link')
            member.type = kind
            with self.assertRaises(ValueError):
                receiver.validate_member(member)
        receiver.validate_member(tarfile.TarInfo('dist/domain/index.html'))

    def test_corrupt_transfer_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                receiver.receive(io.BytesIO(b'changed'), Path(folder) / 'archive', hashlib.sha256(b'original').hexdigest())

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
            config = {'current': str(current), 'services': ['api', 'worker'], 'health_urls': ['https://example.test/health']}
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
            (current / 'previous-release.txt').write_text(str(previous))
            legacy = root / 'legacy-release'
            legacy.mkdir()
            receiver.prune_releases({'release_root': str(root), 'runtime_source': str(runtime), 'env_source': str(root / 'shared.env')}, current)
            self.assertFalse(obsolete.exists())
            self.assertTrue(current.exists() and previous.exists() and legacy.exists())
            self.assertEqual((runtime / 'student-data').read_text(), 'preserved')


if __name__ == '__main__':
    unittest.main()
