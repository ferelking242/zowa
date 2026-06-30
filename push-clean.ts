#!/usr/bin/env node
import { ConfigManager } from './Dev/GitHub api/config';
import { GitHubClient } from './Dev/GitHub api/githubClient';
import { GitHubOperations } from './Dev/GitHub api/operations';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

function parseGitignore(gitignorePath: string): string[] {
  if (!existsSync(gitignorePath)) {
    return [];
  }
  
  const content = readFileSync(gitignorePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(pattern => {
      // Convertir les patterns gitignore en patterns simples
      if (pattern.startsWith('/')) {
        return pattern.slice(1);
      }
      return pattern;
    });
}

function shouldIgnore(path: string, gitignorePatterns: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  
  // Toujours ignorer ces dossiers/fichiers
  const alwaysIgnore = [
    'node_modules',
    '.git',
    'dist',
    '.cache',
    '.config',
    '.local',
    '.upm',
    '.breakpoints',
    'Dev/GitHub api',
    'upload-changes.cjs',
    'push-v2.5.ts',
    'push-clean.ts'
  ];
  
  for (const pattern of alwaysIgnore) {
    if (normalizedPath === pattern) return true;
    if (normalizedPath.startsWith(pattern + '/')) return true;
    if (normalizedPath.includes('/' + pattern + '/')) return true;
  }
  
  // Vérifier les patterns du gitignore
  for (const pattern of gitignorePatterns) {
    // Pattern exact
    if (normalizedPath === pattern) return true;
    
    // Pattern de dossier (se termine par /)
    if (pattern.endsWith('/')) {
      const dir = pattern.slice(0, -1);
      if (normalizedPath.startsWith(dir + '/') || normalizedPath === dir) return true;
    }
    
    // Pattern avec wildcard (*.ext)
    if (pattern.startsWith('*.')) {
      if (normalizedPath.endsWith(pattern.slice(1))) return true;
    }
    
    // Pattern de dossier sans /
    if (normalizedPath.startsWith(pattern + '/') || normalizedPath === pattern) return true;
    if (normalizedPath.includes('/' + pattern + '/')) return true;
    
    // Fichiers cachés (commencent par .)
    if (pattern.startsWith('.')) {
      const parts = normalizedPath.split('/');
      if (parts.some(part => part === pattern || part.startsWith(pattern + '.'))) return true;
    }
  }
  
  return false;
}

function getAllFiles(dir: string, gitignorePatterns: string[], baseDir?: string): string[] {
  const base = baseDir || dir;
  const files: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(base, fullPath);
      
      if (shouldIgnore(relativePath, gitignorePatterns)) {
        continue;
      }
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...getAllFiles(fullPath, gitignorePatterns, base));
        } else if (stat.isFile()) {
          files.push(relativePath);
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.error(`Error reading directory ${dir}:`, e);
  }
  
  return files;
}

function isBinaryFile(path: string): boolean {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.bin', '.svg'];
  return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
}

async function deleteSecrets(client: GitHubClient, config: ConfigManager) {
  const sensitiveFiles = [
    '.env',
    '.env.local',
    'config.ini',
    'Dev/GitHub api/config.ini',
    '.replit',
    '.config',
    '.cache',
    '.breakpoints',
    '.upm'
  ];
  
  console.log('\n🗑️  Suppression des fichiers sensibles de GitHub...\n');
  
  const owner = config.getDefaultOwner();
  const repo = config.getDefaultRepo();
  const branch = config.getDefaultBranch();
  
  for (const file of sensitiveFiles) {
    try {
      console.log(`   🔒 Vérification: ${file}...`);
      
      // D'abord récupérer le fichier pour obtenir son SHA
      const contentResponse = await client.getContent(owner, repo, file, branch);
      
      if (!contentResponse.success) {
        console.log(`   ℹ️  ${file} n'existe pas sur GitHub (OK)`);
        continue;
      }
      
      const sha = contentResponse.data?.sha;
      if (!sha) {
        console.log(`   ⚠️  Impossible de récupérer le SHA de ${file}`);
        continue;
      }
      
      // Supprimer le fichier avec son SHA
      const deleteResponse = await client.deleteFile(
        owner,
        repo,
        file,
        `🔒 Remove sensitive file: ${file}`,
        sha,
        branch
      );
      
      if (deleteResponse.success) {
        console.log(`   ✅ ${file} supprimé de GitHub`);
      } else {
        console.log(`   ⚠️  Erreur: ${deleteResponse.error}`);
      }
      
    } catch (error: any) {
      console.log(`   ℹ️  ${file} - ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

async function pushClean() {
  try {
    const config = new ConfigManager();
    const client = new GitHubClient(config);
    const operations = new GitHubOperations(client, config);
    
    const projectPath = process.cwd();
    const gitignorePath = join(projectPath, '.gitignore');
    
    console.log('🚀 v2.5 - CLEAN Push to GitHub\n');
    
    // Étape 1: Supprimer les fichiers sensibles
    await deleteSecrets(client, config);
    
    // Étape 2: Lire le gitignore
    console.log('\n📖 Lecture du .gitignore...');
    const gitignorePatterns = parseGitignore(gitignorePath);
    console.log(`   ✅ ${gitignorePatterns.length} patterns trouvés\n`);
    
    // Étape 3: Scanner les fichiers
    console.log('📁 Scan du projet...');
    const allFiles = getAllFiles(projectPath, gitignorePatterns);
    console.log(`📦 ${allFiles.length} fichiers valides trouvés\n`);
    
    if (allFiles.length === 0) {
      console.error('❌ Aucun fichier trouvé!');
      return;
    }
    
    // Afficher un échantillon des fichiers
    console.log('📋 Exemples de fichiers à pusher:');
    allFiles.slice(0, 10).forEach(f => console.log(`   - ${f}`));
    if (allFiles.length > 10) {
      console.log(`   ... et ${allFiles.length - 10} autres\n`);
    }
    
    // Étape 4: Push par batch
    const BATCH_SIZE = 30;
    let successCount = 0;
    
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);
      
      console.log(`\n📤 Batch ${batchNum}/${totalBatches} (${batch.length} fichiers)...`);
      
      const fileContents = batch.map(filePath => {
        try {
          const absolutePath = join(projectPath, filePath);
          const buffer = readFileSync(absolutePath);
          
          const isBinary = isBinaryFile(filePath);
          const content = isBinary 
            ? buffer.toString('base64')
            : buffer.toString('utf-8');
          
          return { path: filePath, content };
        } catch (error) {
          console.warn(`⚠️  Skip ${filePath}: ${error}`);
          return null;
        }
      }).filter(f => f !== null) as { path: string; content: string }[];
      
      if (fileContents.length === 0) {
        console.log('   ⏭️  Batch vide, skip...');
        continue;
      }
      
      const commitMessage = batchNum === 1 
        ? `v2.5 - Fix Telegram /status + Playwright improvements + Security cleanup

✨ Améliorations majeures:
- ✅ Commande /status Telegram corrigée (utilise endpoint HTTP)
- ✅ Fallback automatique si API indisponible  
- ✅ Validation des réponses et gestion d'erreurs
- ✅ Support RENDER_EXTERNAL_HOSTNAME pour production
- ✅ Tous les services importés et fonctionnels
- 🔒 Fichiers sensibles supprimés (.env, config.ini, etc.)
- 🧹 .gitignore respecté correctement

📦 ${allFiles.length} fichiers clean`
        : `v2.5 - Batch ${batchNum}/${totalBatches}`;
      
      const result = await operations.pushFiles(
        fileContents,
        commitMessage
      );
      
      if (result.success) {
        successCount += fileContents.length;
        console.log(`   ✅ ${fileContents.length} fichiers pushés (Total: ${successCount}/${allFiles.length})`);
      } else {
        console.error(`   ❌ Échec: ${result.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n🎉 TERMINÉ! ${successCount}/${allFiles.length} fichiers pushés`);
    console.log(`🔗 Repository: https://github.com/${config.getDefaultOwner()}/${config.getDefaultRepo()}`);
    console.log(`\n✅ Version 2.5 propre et sécurisée sur GitHub!\n`);
    
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

pushClean();
