"""Contrato operacional do piloto, sem Docker nem conexão com produção."""
import importlib.util
import base64
import json
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
import types

if sys.platform == 'win32':
    # fcntl só é usado pelo CLI Linux; os comportamentos são testados isoladamente.
    sys.modules.setdefault('fcntl', types.ModuleType('fcntl'))
spec = importlib.util.spec_from_file_location(
    'estallo_vps', Path(__file__).resolve().parents[2] / 'scripts/estallo-vps.py')
vps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vps)

OLD = '1' * 40
NEW = '2' * 40


def live_containers():
    return [dict(State=dict(Running=True), Config=dict(
        Labels={'com.docker.swarm.service.name': 'estallo-crm_' + service},
        Image=(f'registry.example/estallo/{image}:{NEW}' if image else 'upstream:fixed')))
        for service, image in [('app', 'estallo-crm'), ('worker', 'estallo-crm-worker'),
                               ('scheduler', 'estallo-crm-scheduler'), ('waha', None),
                               ('redis', None), ('srh', None)]]


class EstalloVpsTests(unittest.TestCase):
    def setUp(self):
        sandbox = tempfile.TemporaryDirectory()
        self.addCleanup(sandbox.cleanup)
        root = Path(sandbox.name)
        for name, value in [('ROOT', root), ('RUNTIME', root / 'runtime.env'),
                            ('STATE', root / 'deployment.json')]:
            guard = patch.object(vps, name, value)
            guard.start()
            self.addCleanup(guard.stop)
        # Um dublê esquecido deve falhar antes de executar Docker ou fazer HTTP.
        for target, name in [(vps, 'run'), (vps.urllib.request, 'urlopen'),
                             (vps.urllib.request, 'build_opener')]:
            guard = patch.object(target, name, side_effect=AssertionError('I/O sem duble no teste'))
            guard.start()
            self.addCleanup(guard.stop)

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'run')
    def test_architecture_tag_keeps_same_commit_for_all_services(self, run, _namespace):
        vps.register_image_tag(NEW, NEW + '-amd64')
        vps.pull(NEW)
        self.assertEqual([call.args[0][-1] for call in run.call_args_list],
                         [f'registry.example/estallo/{name}:{NEW}-amd64' for name in vps.IMAGES])
        self.assertEqual(vps.image_tag(OLD), OLD)

    def test_architecture_tag_cannot_point_to_another_commit(self):
        for tag in ('latest', OLD + '-amd64', NEW + ';echo test'):
            with self.assertRaises(ValueError):
                vps.register_image_tag(NEW, tag)
        self.assertFalse((vps.ROOT / 'image-tags.json').exists())

    def local_image_response(self, args, **kwargs):
        if args[:3] == ['docker', 'node', 'ls']:
            return b'single-node\n'
        image = args[-1].split('/')[-1].split(':')[0]
        return json.dumps([dict(Id='sha256:' + image, Os='linux', Architecture='amd64',
                              Config=dict(Labels={
                                  'org.opencontainers.image.revision': NEW,
                                  'org.opencontainers.image.source':
                                  'https://github.com/estallosolucoes/estallo-crm'}))]).encode()

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    def test_transferred_images_are_checked_without_registry_pull(self, _namespace):
        with patch.object(vps, 'run', side_effect=self.local_image_response) as run:
            vps.register_local_images(NEW)
            vps.pull(NEW)
        self.assertFalse(any(call.args[0][:2] == ['docker', 'pull']
                             for call in run.call_args_list))
        self.assertEqual(set(vps.local_images()[NEW]), set(vps.IMAGES))

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    def test_transferred_images_refuse_wrong_revision(self, _namespace):
        def wrong_revision(args, **kwargs):
            return self.local_image_response(args, **kwargs).replace(NEW.encode(), OLD.encode())
        with patch.object(vps, 'run', side_effect=wrong_revision):
            with self.assertRaises(ValueError):
                vps.register_local_images(NEW)
        self.assertEqual(vps.local_images(), {})

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    def test_transferred_images_refuse_wrong_platform_or_source(self, _namespace):
        for before, after in [(b'linux', b'windows'), (b'amd64', b'arm64'),
                              (b'estallosolucoes/estallo-crm', b'other/project')]:
            with self.subTest(replacement=after):
                def wrong_image(args, **kwargs):
                    return self.local_image_response(args, **kwargs).replace(before, after)
                with patch.object(vps, 'run', side_effect=wrong_image):
                    with self.assertRaises(ValueError):
                        vps.register_local_images(NEW)
                self.assertEqual(vps.local_images(), {})

    @patch.object(vps, 'run', return_value=b'node-one\nnode-two\n')
    def test_transferred_images_refuse_multiple_swarm_nodes(self, run):
        with self.assertRaises(ValueError):
            vps.register_local_images(NEW)
        self.assertEqual(run.call_count, 1)

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    def test_transferred_images_refuse_overwritten_tag(self, _namespace):
        with patch.object(vps, 'run', side_effect=self.local_image_response):
            vps.register_local_images(NEW)
        def changed_image(args, **kwargs):
            return self.local_image_response(args, **kwargs).replace(b'sha256:', b'changed:')
        with patch.object(vps, 'run', side_effect=changed_image):
            with self.assertRaises(ValueError):
                vps.pull(NEW)
            with self.assertRaises(ValueError):
                vps.register_local_images(NEW)

    @patch.object(vps, 'runtime', return_value={})
    @patch.object(vps, 'run')
    def test_local_rollout_does_not_resolve_unpublished_registry_tags(self, run, _runtime):
        vps.save(vps.ROOT / 'local-images.json', json.dumps({NEW: {}}))
        vps.stack(NEW)
        args = run.call_args.args[0]
        self.assertEqual(args[args.index('--resolve-image') + 1], 'never')
        vps.stack(OLD)
        args = run.call_args.args[0]
        self.assertEqual(args[args.index('--resolve-image') + 1], 'always')

    def test_tag_rejects_mutable_names_and_shell_commands(self):
        for tag in ('latest', 'stable', 'main', 'abc;echo segredo', '', '1' * 39):
            with self.assertRaises(ValueError):
                vps.validate_sha(tag)
        self.assertEqual(vps.validate_sha(NEW), NEW)

    def test_config_is_data_not_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'credentials'
            path.write_text('TOKEN=$(echo segredo)\n')
            self.assertEqual(vps.load_env(path)['TOKEN'], '$(echo segredo)')
            path.write_text('export TOKEN=segredo\n')
            with self.assertRaises(ValueError):
                vps.load_env(path)

    def test_anon_key_cannot_be_configured_as_administrator(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'credentials'
            claims = base64.urlsafe_b64encode(json.dumps(dict(
                role='anon', ref='cbeqboyfmwyjsybszaxy')).encode()).decode().rstrip('=')
            path.write_text(f'NEXT_PUBLIC_SUPABASE_URL={vps.PROJECT}\n'
                            f'SUPABASE_SERVICE_ROLE_KEY=test.{claims}.test\n'
                            'NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test\n'
                            'SUPABASE_DB_URL=postgresql://example\n'
                            'OWNER_EMAIL=owner@example.test\nOWNER_PASSWORD=senha-de-teste-forte\n')
            with patch.object(vps, 'RUNTIME', Path(directory) / 'runtime'), patch.object(vps, 'save') as save:
                with self.assertRaisesRegex(ValueError, 'não a chave anon'):
                    vps.configure(path)
                save.assert_not_called()

    @patch.object(vps, 'pg', return_value=b'1\n')
    @patch.object(vps, 'pull')
    @patch.object(vps, 'REPO', Path(__file__).resolve().parents[2])
    def test_bootstrap_refuses_existing_database_before_pull(self, pull, _pg):
        with self.assertRaises(ValueError):
            vps.bootstrap(NEW)
        pull.assert_not_called()

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'run')
    def test_all_images_are_pulled_at_same_sha(self, run, _namespace):
        vps.pull(NEW)
        self.assertEqual([call.args[0][-1] for call in run.call_args_list],
                         [f'registry.example/estallo/{name}:{NEW}' for name in
                          ('estallo-crm', 'estallo-crm-worker', 'estallo-crm-scheduler')])

    @patch.object(vps, 'available_memory', return_value=100)
    @patch.object(vps, 'pull')
    def test_low_memory_refuses_deploy_before_changes(self, pull, _memory):
        with self.assertRaises(RuntimeError):
            vps.deploy(NEW)
        pull.assert_not_called()

    @patch.object(vps, 'state', return_value={'sha': OLD})
    @patch.object(vps, 'available_memory', return_value=1700)
    @patch.object(vps, 'pull')
    @patch.object(vps, 'backup')
    @patch.object(vps, 'stack')
    @patch.object(vps, 'wait_healthy', side_effect=[RuntimeError('falhou'), None])
    @patch.object(vps, 'save')
    def test_failed_rollout_restores_whole_previous_stack_without_saving_success(
            self, save, _wait, stack, _backup, _pull, _memory, _state):
        with self.assertRaises(vps.DeploymentFailure) as failure:
            vps.deploy(NEW)
        self.assertTrue(failure.exception.rolled_back)
        self.assertEqual([call.args[0] for call in stack.call_args_list], [NEW, OLD])
        save.assert_not_called()

    @patch.object(vps, 'state', return_value={})
    @patch.object(vps, 'available_memory', return_value=1700)
    @patch.object(vps, 'pull')
    @patch.object(vps, 'stack')
    @patch.object(vps, 'wait_healthy', side_effect=RuntimeError('falhou'))
    @patch.object(vps, 'run')
    def test_failed_first_deploy_stops_only_pilot_without_deleting_volumes(
            self, run, _wait, _stack, _pull, _memory, _state):
        with self.assertRaises(vps.DeploymentFailure) as failure:
            vps.deploy(NEW)
        self.assertFalse(failure.exception.rolled_back)
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ['docker', 'service', 'scale'])
        self.assertEqual(len(args[3:]), 6)
        self.assertTrue(all(item.startswith('estallo-crm_') and item.endswith('=0') for item in args[3:]))

    @patch.object(vps, 'run', return_value=b'M\tsupabase/migrations/existing.sql\n')
    @patch.object(vps, 'pg')
    def test_changed_existing_migration_is_refused(self, pg, _run):
        with self.assertRaises(RuntimeError):
            vps.migrate(OLD, NEW)
        pg.assert_not_called()

    @patch.object(vps, 'containers', return_value=[{'State': {'Running': True}}] * 5)
    def test_partial_stack_never_passes_health(self, _containers):
        self.assertFalse(vps.healthy())

    @patch.object(vps, 'containers', return_value=[{'State': {'Running': True, 'OOMKilled': True}}] * 6)
    def test_oom_is_not_healthy(self, _containers):
        self.assertFalse(vps.healthy())

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'containers', side_effect=live_containers)
    @patch.object(vps, 'status_code', side_effect=[200, 307])
    def test_a_different_app_on_domain_never_confirms_deploy(self, _status, _containers, _namespace):
        response = io.BytesIO(json.dumps(dict(data=dict(status='healthy', version=OLD))).encode())
        with patch.object(vps.urllib.request, 'urlopen', return_value=response):
            self.assertFalse(vps.healthy(NEW))

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'containers', side_effect=live_containers)
    @patch.object(vps, 'status_code', side_effect=[200, 307])
    def test_http_200_with_degraded_dependency_is_not_healthy(self, _status, _containers, _namespace):
        response = io.BytesIO(json.dumps(dict(data=dict(status='degraded', version=NEW))).encode())
        with patch.object(vps.urllib.request, 'urlopen', return_value=response):
            self.assertFalse(vps.healthy(NEW))

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'containers', side_effect=live_containers)
    @patch.object(vps, 'status_code', side_effect=[200, 307])
    def test_correct_images_and_domain_confirm_health(self, _status, _containers, _namespace):
        response = io.BytesIO(json.dumps(dict(data=dict(status='healthy', version=NEW))).encode())
        with patch.object(vps.urllib.request, 'urlopen', return_value=response):
            self.assertTrue(vps.healthy(NEW))

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    def test_paused_worker_update_cannot_pass_as_new_version(self, _namespace):
        live = live_containers()
        live[1]['Config']['Image'] = f'registry.example/estallo/estallo-crm-worker:{OLD}'
        with patch.object(vps, 'containers', return_value=live):
            self.assertFalse(vps.healthy(NEW))


if __name__ == '__main__':
    unittest.main()
