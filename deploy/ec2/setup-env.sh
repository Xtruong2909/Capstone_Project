#!/usr/bin/env bash
# Run on EC2. Generate server-only secrets; keep the local developer env separate.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "Usage: bash deploy/ec2/setup-env.sh SITE_ADDRESS [S3_BUCKET] [S3_PREFIX]" >&2
  echo "Example: bash deploy/ec2/setup-env.sh traffic.example.com capstone-traffic-truong-2026 datasets" >&2
  exit 1
fi

site_address=$1
bucket=${2:-capstone-traffic-truong-2026}
prefix=${3-datasets}
if [[ ! $site_address =~ ^(https?://)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:[0-9]+)?$ ]]; then
  echo "Use a domain name, or http://PUBLIC_IP for an HTTP connectivity test." >&2
  exit 1
fi
if [[ ! $bucket =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ || ! $prefix =~ ^[a-zA-Z0-9_./-]*$ ]]; then
  echo "Invalid bucket name or S3 prefix." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
destination="$script_dir/.env"
if [[ -e $destination ]]; then
  echo "Server .env already exists. Edit it directly; regenerating the DB password would break an existing database." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "Install openssl first." >&2; exit 1; }
origin=$site_address
[[ $origin == http://* || $origin == https://* ]] || origin="https://$origin"
database_password=$(openssl rand -hex 32)
jwt_secret=$(openssl rand -hex 32)

umask 077
set -o noclobber
cat > "$destination" <<EOF
SITE_ADDRESS=$site_address
POSTGRES_USER=admin
POSTGRES_DB=traffic_urban
POSTGRES_PASSWORD=$database_password
SECRET_KEY=$jwt_secret
STORAGE_BACKEND=s3
S3_BUCKET_NAME=$bucket
S3_KEY_PREFIX=$prefix
AWS_DEFAULT_REGION=ap-southeast-1
CORS_ALLOWED_ORIGINS=$origin,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
EOF
echo "Created deploy/ec2/.env with private permissions. It is ignored by Git."
