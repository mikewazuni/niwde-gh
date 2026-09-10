FROM alpine:latest

ARG PB_VERSION=0.40.3
# TARGETARCH is set automatically by Buildx (amd64 / arm64)
ARG TARGETARCH=amd64

RUN apk add --no-cache \
    unzip \
    ca-certificates

# download and unzip PocketBase (multi-arch aware)
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

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

# --dir: data dir (mount a volume here to persist)
# --http: listen on all interfaces inside docker
ENTRYPOINT ["/pb/entrypoint.sh"]
