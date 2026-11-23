#!/usr/bin/env bash
# GitHub-hosted runner: assume a short-lived OIDC role before calling this script.
set -Eeuo pipefail
for name in AWS_REGION DEPLOY_BUCKET EC2_INSTANCE_ID EC2_ENV_SOURCE GITHUB_SHA GITHUB_RUN_ID; do
  [[ -n ${!name:-} ]] || { echo "Missing $name" >&2; exit 1; }
done
[[ $GITHUB_SHA =~ ^[0-9a-f]{40,64}$ && $GITHUB_RUN_ID =~ ^[0-9]+$ ]]
[[ $EC2_INSTANCE_ID =~ ^i-[0-9a-f]+$ ]]
[[ $DEPLOY_BUCKET =~ ^[a-z0-9][a-z0-9.-]+$ ]]
[[ $AWS_REGION =~ ^[a-z0-9-]+$ ]]
[[ $EC2_ENV_SOURCE =~ ^/home/ubuntu/[a-zA-Z0-9_./-]+$ ]]

parameters=$(mktemp)
result=$(mktemp)
trap 'rm -f -- "$parameters" "$result"' EXIT
export SSM_PARAMETERS_PATH="$parameters"
python3 - <<'PY'
import json
import os
import shlex
from pathlib import Path

env = os.environ
release = f"{env['GITHUB_SHA']}-{env['GITHUB_RUN_ID']}"
work = f"/home/ubuntu/capstone-deploy/incoming/{release}"
artifact = f"s3://{env['DEPLOY_BUCKET']}/deployments/{release}.tar.gz"
quote = shlex.quote
command = "\n".join([
    "set -Eeuo pipefail",
    "umask 077",
    "command -v aws >/dev/null || { echo 'Install AWS CLI on EC2 first.' >&2; exit 1; }",
    f"mkdir -p {quote(work + '/source')}",
    f"aws s3 cp {quote(artifact)} {quote(work + '/release.tar.gz')} --only-show-errors --region {quote(env['AWS_REGION'])}",
    f"tar --no-same-owner -xzf {quote(work + '/release.tar.gz')} -C {quote(work + '/source')}",
    f"bash {quote(work + '/source/deploy/ec2/deploy-release.sh')} {quote(work + '/source')} {quote(env['EC2_ENV_SOURCE'])} {quote(env['GITHUB_SHA'])}",
])
# SSM runs commands as root; execute deployment with the existing ubuntu account.
parameters = {"commands": ["sudo -u ubuntu -H bash -c " + quote(command)], "executionTimeout": ["1500"]}
Path(env['SSM_PARAMETERS_PATH']).write_text(json.dumps(parameters), encoding="utf-8")
PY

command_id=$(aws ssm send-command \
  --region "$AWS_REGION" --instance-ids "$EC2_INSTANCE_ID" \
  --document-name AWS-RunShellScript --parameters "file://$parameters" \
  --comment "Capstone deploy $GITHUB_SHA" --timeout-seconds 120 \
  --query Command.CommandId --output text)
echo "SSM deployment command: $command_id"

# The default AWS waiter is too short for a Docker build; poll with a fixed limit.
for ((attempt = 0; attempt < 180; attempt++)); do
  if aws ssm get-command-invocation --region "$AWS_REGION" \
    --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" > "$result" 2>/dev/null; then
    state=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["Status"])' "$result")
    case "$state" in
      Success)
        python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("StandardOutputContent", ""))' "$result"
        exit 0 ;;
      Failed|Cancelled|TimedOut|Cancelling)
        python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); print(data.get("StandardOutputContent", "")); print(data.get("StandardErrorContent", ""), file=sys.stderr)' "$result"
        exit 1 ;;
    esac
  fi
  sleep 10
done
echo "Timed out waiting for SSM command $command_id. Check its status in AWS before retrying." >&2
exit 1
