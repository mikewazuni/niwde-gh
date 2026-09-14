## Goal

User easliy use this POC app with simple docker compose image from `ghcr.io/mikewazuni/niwde-gh:latest`

## The Stack

- **PocketBase** extend with JavaScript as the Framework of the core app. Documentation on https://pocketbase.io/docs
- **N8n** chat integration, acting as Receptionist, accessed through mcp

## Current State

Current project is on an early development, drop-in replacement for migration is preferred. Rebuild the container in local development.

## Workflow

Explore current records in PocketBase and n8n existing flow before when planning.
Must read `N8N_RECEPTIONIS_WORKFLOW.md` for n8n receptionist overview. If workflow changed, update that file.

## API Docs

Must maintain up-to-date API docs file in `docs/niwde-gh-oc/`
OpenCollection Spec docs (https://spec.opencollection.com/)

## Commit Message

Follow conventional commit message format, single line
