# 🚀 GitHub API - Universal Tool

API universelle et réutilisable pour gérer les opérations GitHub depuis n'importe quel projet.

## 📁 Structure

```
Dev/GitHub api/
├── config.ini         # Configuration (token, repo, options)
├── config.ts          # Gestionnaire de configuration
├── githubClient.ts    # Client API GitHub
├── operations.ts      # Opérations haut niveau
├── syncProject.ts     # Synchronisation de projets
├── cli.ts            # Interface en ligne de commande
└── README.md         # Cette documentation
```

## ⚙️ Configuration

### Méthode 1 : Fichier .env (RECOMMANDÉ)

L'API lit automatiquement le fichier `.env` à la racine du projet et remplit le `config.ini` avec les valeurs trouvées.

**Ajoutez ces variables dans votre `.env` :**

```bash
# GitHub API Configuration
GITHUB_TOKEN=ghp_votre_token_ici
GITHUB_USERNAME=votre-username
GITHUB_REPO_NAME=nom-du-repo
GITHUB_REPO_OWNER=proprietaire-du-repo
GITHUB_BRANCH=main
```

**Puis exécutez simplement l'API :**

```bash
npx tsx Dev/GitHub\ api/cli.ts sync
```

L'API va :
1. ✅ Lire le `.env`
2. ✅ Remplir automatiquement le `config.ini` avec ces valeurs
3. ✅ Utiliser le `config.ini` pour les opérations GitHub

### Méthode 2 : Fichier config.ini

Éditez `config.ini` pour configurer l'API :

```ini
[authentication]
github_token = YOUR_GITHUB_TOKEN_HERE  # Ou utilisez la variable d'environnement GITHUB_TOKEN
github_username = YOUR_GITHUB_USERNAME

[repository]
default_repo_name = your-repo-name
default_repo_owner = YOUR_GITHUB_USERNAME
default_branch = main
default_private = false

[options]
auto_commit = true
commit_message_prefix = [Auto]
dry_run = false
verbose = true
batch_size = 100

[ignore]
patterns = node_modules,.env,.replit,.config,dist,build,.git,.cache,.next,.vercel,.turbo,coverage,.nyc_output,tmp,temp,*.log,.DS_Store,attached_assets
```

⚠️ **IMPORTANT** : Ne committez JAMAIS votre vrai token GitHub dans config.ini ! Utilisez toujours des variables d'environnement ou un fichier `.env` local.

## 🔧 Utilisation

### 1. Via CLI (Ligne de commande)

```bash
# Synchroniser le projet actuel
npx tsx Dev/GitHub\ api/cli.ts sync

# Synchroniser un dossier spécifique
npx tsx Dev/GitHub\ api/cli.ts sync /path/to/project "Mon message de commit"

# Créer un nouveau repo
npx tsx Dev/GitHub\ api/cli.ts create-repo mon-nouveau-repo

# Mettre à jour un fichier
npx tsx Dev/GitHub\ api/cli.ts update-file README.md "Nouveau contenu"

# Afficher l'aide
npx tsx Dev/GitHub\ api/cli.ts help
```

### 2. Via Import TypeScript

```typescript
import { ConfigManager } from './Dev/GitHub api/config';
import { GitHubClient } from './Dev/GitHub api/githubClient';
import { GitHubOperations } from './Dev/GitHub api/operations';
import { ProjectSync } from './Dev/GitHub api/syncProject';

// Initialiser
const config = new ConfigManager();
const client = new GitHubClient(config);
const operations = new GitHubOperations(client, config);
const sync = new ProjectSync(operations, config);

// Créer un repo
await operations.ensureRepo('mon-repo');

// Pousser des fichiers
await operations.pushFiles([
  { path: 'README.md', content: '# Hello' },
  { path: 'src/index.ts', content: 'console.log("Hi")' }
], 'Initial commit');

// Synchroniser un projet
await sync.syncDirectory('/path/to/project', 'Sync project');

// Mettre à jour un fichier
await operations.updateFile('README.md', '# Updated', 'Update README');
```

### 3. Utilisation par d'autres agents

Les autres agents peuvent utiliser cette API sans créer de nouveaux fichiers :

1. **Modifier `config.ini`** avec leurs paramètres
2. **Exécuter** : `npx tsx Dev/GitHub\ api/cli.ts sync`
3. **C'est tout !** 🎉

## 🎯 Fonctionnalités

- ✅ **Création de repos** GitHub
- ✅ **Push de fichiers** multiples en un commit
- ✅ **Mise à jour** de fichiers individuels
- ✅ **Synchronisation** de projets entiers
- ✅ **Gestion automatique** des blobs, trees, commits
- ✅ **Support binaire** (images, fonts, etc.)
- ✅ **Filtrage** de fichiers via patterns
- ✅ **Mode dry-run** pour tester
- ✅ **Logs verbeux** optionnels
- ✅ **Configuration centralisée** via config.ini

## 🔒 Sécurité

- Le token GitHub n'est **jamais loggé**
- Support des variables d'environnement : `GITHUB_TOKEN` (override config.ini)
- Validation de la configuration au démarrage

## 📝 Exemples

### Push du projet actuel vers GitHub

```bash
npx tsx Dev/GitHub\ api/cli.ts sync . "Initial commit"
```

### Créer un nouveau repo et pusher

```typescript
const result = await operations.ensureRepo('nouveau-projet');
await sync.syncDirectory('./mon-projet', 'Premier commit');
```

### Mettre à jour la configuration d'un autre projet

```ini
# Modifier config.ini
[repository]
default_repo_name = autre-projet
default_repo_owner = autre-user

# Puis exécuter
npx tsx Dev/GitHub\ api/cli.ts sync
```

## 🚀 Déploiement

Cette API est **universelle** et peut être :
- Copiée dans n'importe quel projet
- Utilisée par n'importe quel agent
- Configurée via `config.ini` sans modification de code

## 📞 Support

Pour toute question ou problème, consultez la documentation GitHub API :
https://docs.github.com/en/rest
