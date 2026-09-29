#!/bin/sh
# Builds the static site for Vercel into dist/ (tasks are stored in the browser).
set -e
rm -rf dist
mkdir -p dist
cp templates/index.html dist/index.html
cp -R static dist/static
