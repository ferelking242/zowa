# TempMail Pro

Application de messagerie temporaire avec validation automatique de liens et bot Telegram intégré.

## 🚀 Fonctionnalités

- 📧 Génération d'emails temporaires
- 📬 Réception et consultation de messages
- 🔗 Validation automatique de liens (Firebase, Replit, etc.)
- 🤖 Bot Telegram avec auto-refresh toutes les 5 secondes
- 🌐 Interface web moderne avec React + Vite
- 🗄️ Base de données Supabase PostgreSQL
- 🎭 Automation avec Playwright (mode stealth)

## 📁 Structure du Projet

```
├── client/               # Frontend React
│   ├── src/
│   │   ├── components/   # Composants UI
│   │   ├── pages/        # Pages de l'app
│   │   └── lib/          # Utilitaires
│   └── index.html
│
├── server/               # Backend Express.js
│   ├── bot/              # Bot Telegram (module isolé)
│   ├── services/         # Services métier
│   ├── lib/              # Utilitaires backend
│   ├── index.ts          # Point d'entrée
│   └── routes.ts         # Routes API
│
└── shared/               # Types partagés
    └── schema.ts         # Schémas Zod
```

## 🛠️ Installation Locale

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Configurer les variables d'environnement dans .env

# Lancer en développement
npm run dev
```

## 🌍 Déploiement

### Option 1: Render (Recommandé - Gratuit avec Playwright) 🎭

Render supporte **le site web + bot Telegram + Playwright** sur la même instance.

**Avantages:**
- ✅ Vraiment gratuit (pas besoin de carte bancaire)
- ✅ Support complet de Playwright avec Chromium
- ✅ Auto-validation des liens fonctionnelle
- ✅ Déploiement automatique depuis GitHub

**Déploiement:**

1. **Connectez votre repo GitHub** sur [Render](https://render.com)
2. **Créer un nouveau Web Service**
3. **Configuration automatique** via `render.yaml` (déjà configuré)
4. **Ajouter les variables d'environnement** (voir ci-dessous)

Le fichier `render.yaml` configure automatiquement:
- Installation de Playwright + Chromium
- Toutes les dépendances système nécessaires
- Build et démarrage optimisés

### Option 2: Railway

Railway peut héberger **à la fois le site web ET le bot Telegram** sur la même instance.

**Note:** Railway offre 30 jours gratuits puis devient payant ($5/mois).

**Déploiement:**

1. **Créer un nouveau projet sur Railway**
   - Connectez votre repo GitHub
   - Railway détectera automatiquement le `package.json`

2. **Configurer les variables d'environnement** dans Railway/Render:

```env
# Supabase (Obligatoire)
SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres

# API Configuration
API_BASE_URL=https://your-app.railway.app
VITE_API_BASE_URL=https://your-app.railway.app

# Session
SESSION_SECRET=your_secure_random_string

# Email Service
EMAIL_SERVICE_DOMAIN=antdev.org

# Telegram Bot (Optionnel - obtenir depuis @BotFather)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000

# Node
NODE_ENV=production
PORT=5000
```

3. **Déployer**
   - Railway build automatiquement avec: `npm run build`
   - Lance le serveur avec: `npm start`
   - Le site ET le bot seront actifs simultanément ✅

### ⚙️ Configuration du Bot Telegram

1. Créer un bot via [@BotFather](https://t.me/botfather) sur Telegram
2. Copier le token fourni
3. Ajouter `TELEGRAM_BOT_TOKEN` dans les variables d'environnement Railway
4. Le bot se lance automatiquement avec le serveur

**Note**: Si aucun token n'est fourni, le bot se désactive automatiquement sans affecter le site web.

## 📦 Scripts Disponibles

```bash
npm run dev      # Développement local
npm run build    # Build production (frontend + backend)
npm start        # Lancer en production
npm run check    # Vérification TypeScript
```

## 🔧 Technologies Utilisées

### Frontend
- React 18
- Vite
- TanStack Query
- Tailwind CSS
- shadcn/ui
- Wouter (routing)

### Backend
- Express.js
- TypeScript
- Supabase (PostgreSQL)
- Playwright (automation)
- Telegraf (bot Telegram)
- Zod (validation)

## 📝 Variables d'Environnement

Consultez `.env.example` pour la liste complète des variables requises.

### Variables Obligatoires:
- `SUPABASE_URL` et clés Supabase
- `DATABASE_URL` (connection string PostgreSQL)
- `SESSION_SECRET` (pour les sessions Express)

### Variables Optionnelles:
- `TELEGRAM_BOT_TOKEN` (pour activer le bot)
- `CAPTCHA_API_KEY` (pour résolution automatique de CAPTCHA)

## 🚨 Notes de Sécurité

- Ne jamais commiter le fichier `.env`
- Générer un `SESSION_SECRET` fort et unique
- Utiliser les clés Supabase appropriées (service role pour le backend)
- Activer Row Level Security (RLS) sur Supabase

## 📄 Licence

MIT

## 👨‍💻 Support

Pour toute question, consultez la documentation ou créez une issue sur GitHub.
