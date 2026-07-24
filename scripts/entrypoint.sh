#!/bin/sh
set -e

# Cron doesn't inherit Docker env, so persist for scheduled backups
export BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
export DB_PATH="${DB_PATH:-/app/data/parish.db}"

cat > /tmp/cron-env.sh <<EOF
BACKUP_DIR=$BACKUP_DIR
DB_PATH=$DB_PATH
EOF

echo "0 3 * * * . /tmp/cron-env.sh; node /usr/local/bin/backup-db.js >> /app/backups/cron.log 2>&1" > /etc/crontabs/root

crond -b -l 2

# Run backup on startup
node /usr/local/bin/backup-db.js

exec node server/dist/index.js
