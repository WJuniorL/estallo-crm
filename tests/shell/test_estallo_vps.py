"""Contrato operacional do piloto, sem Docker nem conexão com produção."""
import importlib.util
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


class EstalloVpsTests(unittest.TestCase):
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

    @patch.object(vps, 'pg', return_value=b'1\n')
    @patch.object(vps, 'pull')
    def test_bootstrap_refuses_existing_database_before_pull(self, pull, _pg):
        with self.assertRaises(ValueError):
            vps.bootstrap(NEW)
        pull.assert_not_called()

    @patch.object(vps, 'image_namespace', return_value='registry.example/estallo')
    @patch.object(vps, 'run')
    def test_all_images_are_pulled_at_same_sha(self, run, _namespace):
        vps.pull(NEW)
        self.assertEqual([call.args[0][-1] for call in run.call_args_list],
                         [f'registry.example/estallo/{name}:{NEW}' for name in vps.IMAGES])

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


if __name__ == '__main__':
    unittest.main()
