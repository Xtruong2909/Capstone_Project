"""Exercise deployment orchestration with fake tools; never contact EC2 or AWS."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent
FAKE_TOOL = r'''#!/usr/bin/env python3
import json, os, pathlib, sys, tarfile
tool = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['MOCK_LOG'], 'a') as log:
    log.write(json.dumps([tool, *args]) + '\n')
if tool == 'sudo':
    if args[0] == '-n': args.pop(0)
    os.execvpe(args[0], args, os.environ)
elif tool == 'git':
    if 'rev-parse' in args: print('a' * 40)
    elif 'archive' in args:
        source = pathlib.Path(args[args.index('-C') + 1])
        with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
            for path in sorted(source.rglob('*')):
                if path.is_file() and '.git' not in path.parts:
                    archive.add(path, arcname=str(path.relative_to(source)))
elif tool == 'docker':
    fail = os.environ.get('MOCK_FAIL', '')
    if args[0] == 'inspect': print('old-' + args[-1])
    if args[0] == 'compose':
        if '-f' not in args: sys.exit(0)
        compose_file = args[args.index('-f') + 1]
        command = args[args.index('-f') + 2:]
        if command[:2] == ['ps', '-q']: print(command[-1])
        elif command[0] == 'build' and fail == 'build': sys.exit(1)
        elif command[0] == 'up' and '/releases/' in compose_file and fail == 'start': sys.exit(1)
        elif command[0] == 'exec':
            text = ' '.join(command)
            if 'pg_dump' in text: sys.stdout.buffer.write(b'MOCK_DATABASE_BACKUP')
            elif 'pg_restore' in text:
                assert sys.stdin.buffer.read() == b'MOCK_DATABASE_BACKUP'
            elif 'SELECT' in text: print(os.environ.get('MOCK_JOBS', '0'))
            elif 'psql' in text and '-f' in command and fail == 'migration': sys.exit(1)
elif tool == 'curl' and os.environ.get('MOCK_FAIL') == 'health': sys.exit(22)
elif tool == 'aws':
    if args[:2] == ['ssm', 'send-command']:
        value = args[args.index('--parameters') + 1].removeprefix('file://')
        pathlib.Path(os.environ['MOCK_PARAMETERS']).write_text(pathlib.Path(value).read_text())
        print('mock-command-id')
    elif args[:2] == ['ssm', 'get-command-invocation']:
        print(json.dumps({'Status':os.environ.get('MOCK_SSM_STATUS', 'Success'), 'StandardOutputContent':'mock deployment output', 'StandardErrorContent':''}))
'''


class DeploymentScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.source = self.root / "checkout"
        (self.source / ".git").mkdir(parents=True)
        target = self.source / "deploy/ec2"
        target.mkdir(parents=True)
        (target / "compose.yml").write_text("name: capstone-ec2\n")
        (target / "ci-migrations.txt").write_text("# allowlist\n20261205_browser_sessions.sql\n")
        (self.source / "BE/migrations").mkdir(parents=True)
        (self.source / "BE/migrations/20261205_browser_sessions.sql").write_text("SELECT 1;\n")
        self.env_file = self.home / "Capstone_Project/deploy/ec2/.env"
        self.env_file.parent.mkdir(parents=True)
        self.env_file.write_text("SECRET_KEY=test-only-private-env\n")
        tools = self.root / "bin"
        tools.mkdir()
        for tool in ("sudo", "docker", "git", "curl", "flock", "aws"):
            path = tools / tool
            path.write_text(FAKE_TOOL)
            path.chmod(0o755)
        self.log = self.root / "calls.jsonl"
        self.parameters = self.root / "parameters.json"
        self.env = {
            **os.environ, "PATH": f"{tools}:{os.environ['PATH']}", "HOME": str(self.home),
            "MOCK_LOG": str(self.log), "MOCK_PARAMETERS": str(self.parameters),
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def deploy(self, **settings: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["bash", str(SCRIPTS / "deploy-release.sh"), str(self.source), str(self.env_file)],
            env={**self.env, **settings}, capture_output=True, text=True, timeout=20,
        )

    def calls(self) -> list[list[str]]:
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_success_backs_up_and_keeps_private_env_out_of_release(self) -> None:
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.home / "capstone-deploy/current"
        self.assertTrue(current.is_symlink())
        self.assertFalse((current / "deploy/ec2/.env").exists())
        backups = list((self.home / "capstone-deploy/backups").glob("*/database.dump"))
        self.assertEqual(backups[0].read_bytes(), b"MOCK_DATABASE_BACKUP")
        self.assertNotIn("test-only-private-env", result.stdout + result.stderr)

    def test_active_jobs_stop_before_build_or_restart(self) -> None:
        self.assertNotEqual(self.deploy(MOCK_JOBS="1").returncode, 0)
        self.assertFalse(any("build" in call or "up" in call for call in self.calls()))

    def test_failed_build_or_migration_leaves_containers_running(self) -> None:
        for failure in ("build", "migration"):
            with self.subTest(failure=failure):
                self.log.write_text("")
                self.assertNotEqual(self.deploy(MOCK_FAIL=failure).returncode, 0)
                self.assertFalse(any("up" in call for call in self.calls()))

    def test_failed_start_or_health_rolls_back_application(self) -> None:
        for failure in ("start", "health"):
            with self.subTest(failure=failure):
                self.log.write_text("")
                self.assertNotEqual(self.deploy(MOCK_FAIL=failure).returncode, 0)
                calls = self.calls()
                self.assertTrue(any("up" in call and str(self.env_file.parent / "compose.yml") in call for call in calls))
                self.assertFalse((self.home / "capstone-deploy/current").exists())
                self.assertFalse(any("--clean" in call or "down" in call for call in calls))

    def test_ssm_command_sends_only_artifact_and_env_path(self) -> None:
        env = {
            **self.env, "AWS_REGION": "ap-southeast-1", "DEPLOY_BUCKET": "test-bucket",
            "EC2_INSTANCE_ID": "i-0123456789abcdef0", "GITHUB_SHA": "a" * 40,
            "GITHUB_RUN_ID": "123", "EC2_ENV_SOURCE": "/home/ubuntu/Capstone_Project/deploy/ec2/.env",
        }
        result = subprocess.run(
            ["bash", str(SCRIPTS / "send-deploy-command.sh")],
            env=env, capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        command = json.loads(self.parameters.read_text())["commands"][0]
        self.assertIn("sudo -u ubuntu", command)
        self.assertIn("s3://test-bucket/deployments/", command)
        self.assertNotIn("test-only-private-env", command)


if __name__ == "__main__":
    unittest.main()
