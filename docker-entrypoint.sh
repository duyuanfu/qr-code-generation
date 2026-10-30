#!/bin/sh
set -e

# Ensure data and upload directories exist and are fully writable
mkdir -p /app/data/uploads
chmod -R 777 /app/data

# Start Node.js application
exec node server.js
