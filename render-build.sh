#!/usr/bin/env bash
set -euo pipefail

# Prebuilt dlib wheel: Render can't apt-get, and compiling dlib runs out of memory.
pip install --upgrade pip
pip install dlib-bin
pip install --no-deps face-recognition==1.3.0
pip install -r requirements.txt

# React frontend, served by Flask from web/dist
(cd web && npm ci && npm run build)
