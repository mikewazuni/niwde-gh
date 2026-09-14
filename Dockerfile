FROM alpine:3.22

ARG PB_VERSION=0.40.3
# TARGETARCH is set automatically by Buildx (amd64 / arm64)
ARG TARGETARCH=amd64

# Single layer: install deps, fetch + unzip PocketBase, cleanup.
# Pinned base + busybox wget retries keeps rebuilds cache-friendly and reproducible.
RUN apk add --no-cache ca-certificates unzip \
    && wget -T 30 -t 3 -O /tmp/pb.zip \
        "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip

# copy JS hooks (custom routes, hooks) into the image
# pb_hooks/*.pb.js is auto-loaded by PocketBase's embedded JSVM (goja)
COPY ./pb_hooks /pb/pb_hooks

# copy JS migrations (collection schemas)
COPY ./pb_migrations /pb/pb_migrations

# optional static files served at / (only if dir exists locally)
COPY ./pb_public /pb/pb_public

COPY ./entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh

EXPOSE 8090

WORKDIR /pb

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8090/api/health || exit 1

# --dir: data dir (mount a volume here to persist)
# --http: listen on all interfaces inside docker
ENTRYPOINT ["/pb/entrypoint.sh"]
