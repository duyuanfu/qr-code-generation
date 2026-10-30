#!/bin/sh
set -e

# Ensure data and upload directories exist and owned by nextjs (uid: 1001)
mkdir -p /app/data/uploads
chown -R nextjs:nodejs /app/data
chmod -R 775 /app/data

# Switch to nextjs user to run the app
exec su-exec nextjs node server.js
