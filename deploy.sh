#!/bin/bash

# API Deployment Script for Production

echo "🚀 Deploying Petrolink Talent API v1.0.0-beta"

# 1. Environment setup
export NODE_ENV=production
export PORT=8080
export SUPABASE_URL="your_supabase_url"
export SUPABASE_ANON_KEY="your_anon_key"
export SUPABASE_SERVICE_KEY="your_service_key"
export API_KEY_SALT="your_salt_here"
export ALLOWED_ORIGINS="https://app.petrolinkhub.com,https://client-domain.com"

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm ci --only=production

# 4. Run database migrations
node scripts/migrate.js

# 5. Start with PM2 (process manager)
pm2 start server.js --name "petrolink-api" -i max --update-env

# 6. Enable auto-restart on reboot
pm2 save
pm2 startup

echo "✅ API deployed successfully!"
echo "📊 Monitoring: pm2 monit"
echo "📝 Logs: pm2 logs petrolink-api"
