# syntax=docker/dockerfile:1.7

# Fork overlay for the self-hosted Railway instance.
#
# Base: the upstream canary image the fork branched from (same migrations and
# node_modules as the fork's base commit). The server bundle and the web and
# mobile assets are replaced by fork builds. The upstream native module is
# kept: a fork-built one needs AFFINE_PRO_PUBLIC_KEY embedded at compile time
# or the self-hosted server refuses to start.
ARG BASE_IMAGE=ghcr.io/toeverything/affine:canary@sha256:22b937f89dbf17cd978ae2a52ba6e99d90dee78e016a10c448b2997f6fa94b1d
FROM ${BASE_IMAGE}

# drop upstream web and mobile assets, keep the admin panel
RUN find /app/static -mindepth 1 -maxdepth 1 ! -name admin -exec rm -rf {} +

COPY web/ /app/static/
COPY mobile/ /app/static/mobile/
COPY dist/main.js dist/main.js.map /app/dist/
