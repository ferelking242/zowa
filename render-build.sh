#!/usr/bin/env bash
# Render build script pour installer les dépendances Playwright

set -e

echo "📦 Installing Node.js dependencies..."
npm install

echo "🎭 Installing Playwright browsers and system dependencies..."
# Installer Chromium avec toutes les dépendances système
npx playwright install chromium
npx playwright install-deps chromium

echo "✅ Build completed successfully!"
