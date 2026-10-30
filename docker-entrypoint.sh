#!/bin/sh
set -e

# Ensure data and upload directories exist
mkdir -p /app/data/uploads

# Start Node.js application
exec node server.js
