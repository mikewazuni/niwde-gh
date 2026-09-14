# Niwde Stay

POC Hotel CRUD Project
Framework use PocketBase, docs: https://pocketbase.io/docs

## Quick start

1. Create `docker-compose.yml`

```yaml
volumes:
  niwde_data: {}

services:
  niwde-stay-app:
    image: ghcr.io/mikewazuni/niwde-stay:latest
    ports:
      - 8190:8090
    volumes:
      - niwde_data:/pb/pb_data
    environment:
      EMAIL: admin@app.com
      ADMIN_PASSWORD: Admin12345
```

2. Run

```bash
docker compose up -d
```

3. Open http://localhost:8190/_/ in your browser

## Create the superuser

```bash
docker compose exec niwde-pb /pb/pocketbase superuser upsert admin@app.com Admin12345 --dir=/pb/pb_data
```

## API Endpoints

See [docs/nide-stay-oc/](docs/nide-stay-oc/) for API docs.
