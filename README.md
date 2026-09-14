# Niwde Guest House

POC Hotel CRUD Project
Framework use PocketBase, docs: https://pocketbase.io/docs

## Quick start

1. Create `docker-compose.yml`

```yaml
networks:
  niwde-gh-net:
    name: niwde-gh-net

volumes:
  niwde_gh_data: {}

services:
  niwde-gh-app:
    image: ghcr.io/mikewazuni/niwde-gh:latest
    ports:
      - 8190:8090
    networks:
      - niwde-gh-net
    volumes:
      - niwde_gh_data:/pb/pb_data
    environment:
      EMAIL: admin@app.com
      ADMIN_PASSWORD: Admin12345
```

2. Run

```bash
docker compose up -d
```

3. Open http://localhost:8190/_/ in your browser, login with `admin@app.com` / `Admin12345`.

## API Docs

See [docs/niwde-gh-oc/](docs/niwde-gh-oc/) for API docs.
