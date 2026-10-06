#!/usr/bin/env bash
set -euo pipefail

# Update and install dependencies for dlib
apt-get update && apt-get install -y cmake libopenblas-dev liblapack-dev libx11-dev

# Python API + face recognition
pip install -r requirements.txt

# React frontend, served by Flask from web/dist
(cd web && npm ci && npm run build)
