#!/bin/sh
set -e

# Auto-provision first superuser from env (Elestio-style EMAIL/ADMIN_PASSWORD).
# Vanilla PocketBase has no env magic, so we do `superuser upsert` before serve.
if [ -n "$EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Upserting superuser $EMAIL..."
  /pb/pocketbase superuser upsert "$EMAIL" "$ADMIN_PASSWORD" --dir=/pb/pb_data || echo "superuser upsert failed (continuing to serve)"
else
  echo "Skipping superuser provisioning (EMAIL or ADMIN_PASSWORD not set)"
fi

exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data
