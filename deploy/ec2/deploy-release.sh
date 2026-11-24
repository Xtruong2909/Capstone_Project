#!/usr/bin/env bash
# Run on EC2 through SSM, as ubuntu, for the trusted main-branch deployment job.
set -Eeuo pipefail
umask 077

source_dir=$(realpath -- "${1:?Usage: deploy-release.sh CHECKOUT_DIR SERVER_ENV}")
env_source=$(realpath -e -- "${2:?Provide the existing private server env}")
deploy_root="$HOME/capstone-deploy"
original_dir=$(realpath -- "$(dirname -- "$env_source")/../..")

for command in git docker sudo flock curl tar sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done
sudo -n docker version --format '{{.Server.Version}}' >/dev/null
sudo -n docker compose version >/dev/null
test -f "$env_source" || { echo 'Server env not found.' >&2; exit 1; }

mkdir -p "$deploy_root/releases" "$deploy_root/backups"
exec 9>"$deploy_root/deployment.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

sha=${3:-}
if [[ -z $sha ]]; then sha=$(git -C "$source_dir" rev-parse HEAD); fi
[[ $sha =~ ^[0-9a-f]{40,64}$ ]] || { echo 'Invalid commit.' >&2; exit 1; }
release_id="${sha:0:12}-$(date -u +%Y%m%d-%H%M%S)-$$"
release_dir="$deploy_root/releases/$release_id"
backup_dir="$deploy_root/backups/$release_id"
previous_dir="$original_dir"
if [[ -L $deploy_root/current ]]; then
  previous_dir=$(realpath -e -- "$deploy_root/current")
elif [[ -e $deploy_root/current ]]; then
  echo 'The current release path must be a symlink.' >&2
  exit 1
fi
mkdir -p "$release_dir" "$backup_dir"
if [[ -d $source_dir/.git ]]; then
  git -C "$source_dir" archive "$sha" | tar -x -C "$release_dir"
else
  # SSM receives a git-archive artifact containing tracked source files only.
  tar -C "$source_dir" -cf - . | tar -x -C "$release_dir"
fi
test -f "$release_dir/deploy/ec2/compose.yml"

# All releases use one private env and the same Compose project/volumes.
# The env is never copied into the checkout or uploaded to GitHub.
compose_at() {
  local directory=$1
  shift
  sudo -n env EC2_ENV_FILE="$env_source" docker compose \
    --project-name capstone-ec2 --env-file "$env_source" \
    -f "$directory/deploy/ec2/compose.yml" "$@"
}
compose() { compose_at "$release_dir" "$@"; }
db_sql() {
  compose exec -T postgres sh -c \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
}

compose config --quiet

# Save actual running image IDs, not mutable image tags.
backend_container=$(compose ps -q backend)
web_container=$(compose ps -q web)
[[ -n $backend_container && -n $web_container ]] || {
  echo 'This deployment expects the existing healthy EC2 stack.' >&2; exit 1;
}
backend_image=$(sudo -n docker inspect --format '{{.Image}}' "$backend_container")
web_image=$(sudo -n docker inspect --format '{{.Image}}' "$web_container")
sudo -n docker tag "$backend_image" "capstone-backend-ec2:rollback-$release_id"
sudo -n docker tag "$web_image" "capstone-web-ec2:rollback-$release_id"

active_jobs=$(db_sql -At -c "
  SELECT
    (SELECT count(*) FROM dataset_upload_jobs WHERE status IN ('QUEUED','RUNNING','UPLOADING')) +
    (SELECT count(*) FROM dataset_group_processing_jobs WHERE status IN ('QUEUED','RUNNING')) +
    (SELECT count(*) FROM traffic_aggregation_jobs WHERE status IN ('QUEUED','RUNNING')) +
    (SELECT count(*) FROM model_training_experiments WHERE status IN ('PENDING','RUNNING','TRAINING')) +
    (SELECT count(*) FROM prediction_runs WHERE status IN ('PENDING','QUEUED','RUNNING','PROCESSING')) +
    (SELECT count(*) FROM lag_feature_generations WHERE status IN ('PENDING','RUNNING','PROCESSING'));")
[[ $active_jobs == 0 ]] || {
  echo 'Active data jobs detected. Wait for completion, then rerun this deployment.' >&2
  exit 1
}

application_changed=0
rollback() {
  local result=$?
  trap - ERR
  echo 'New release failed; restoring previous application image tags.' >&2
  sudo -n docker tag "$backend_image" capstone-backend-ec2:local
  sudo -n docker tag "$web_image" capstone-web-ec2:local
  if [[ $application_changed == 1 ]]; then
    if ! compose_at "$previous_dir" up -d --no-build --wait backend web; then
      echo "Automatic application rollback failed. Backup: $backup_dir" >&2
    fi
  fi
  exit "$result"
}
trap rollback ERR

# Build first; build failures leave the running containers untouched.
compose build backend web

# Back up before schema changes. Never automatically restore over live user data.
compose exec -T postgres sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump"
compose exec -T postgres pg_restore --list < "$backup_dir/database.dump" >/dev/null
printf '%s\n' "$previous_dir" > "$backup_dir/previous-release.txt"
printf '%s\n' "$backend_image" "$web_image" > "$backup_dir/previous-images.txt"

# This allowlist contains only additive, backward-compatible, idempotent SQL.
while IFS= read -r migration || [[ -n $migration ]]; do
  [[ -z $migration || $migration == \#* ]] && continue
  [[ $migration =~ ^[0-9]{8}_[a-z0-9_]+\.sql$ ]] || {
    echo 'Invalid migration filename.' >&2; exit 1;
  }
  migration_path="$release_dir/BE/migrations/$migration"
  test -f "$migration_path"
  # Compose attaches stdin by default, even for psql -f. Do not let it consume
  # subsequent filenames from the allowlist being read by this loop.
  compose cp "$migration_path" postgres:/tmp/capstone-ci-migration.sql < /dev/null
  db_sql -f /tmp/capstone-ci-migration.sql < /dev/null
done < "$release_dir/deploy/ec2/ci-migrations.txt"

application_changed=1
compose up -d --no-build --wait --wait-timeout 180 backend web
curl --fail --silent --show-error --retry 5 --retry-delay 3 --max-time 20 \
  https://trafficflow.id.vn/health/db >/dev/null

ln -s "$release_dir" "$deploy_root/current.next.$release_id"
mv -Tf "$deploy_root/current.next.$release_id" "$deploy_root/current"
trap - ERR
echo "Deployed commit $sha"
echo "Release: $release_dir"
echo "Database backup: $backup_dir/database.dump"
