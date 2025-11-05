#!/usr/bin/env node
import { ConfigManager } from './config';
import { GitHubClient } from './githubClient';
import { GitHubOperations } from './operations';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';

async function getAllFiles(dir: string, ignorePatterns: string[], baseDir?: string): Promise<string[]> {
  const base = baseDir || dir;
  const files: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(base, fullPath);
      
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...await getAllFiles(fullPath, ignorePatterns, base));
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

function shouldIgnore(path: string, patterns: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  
  for (const pattern of patterns) {
    if (normalizedPath === pattern) return true;
    if (normalizedPath.includes(`/${pattern}/`)) return true;
    if (normalizedPath.startsWith(pattern + '/')) return true;
    if (pattern.startsWith('*.') && normalizedPath.endsWith(pattern.slice(1))) return true;
  }
  
  return false;
}

function isBinaryFile(path: string): boolean {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.bin'];
  return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
}

async function pushInBatches() {
  try {
    const config = new ConfigManager();
    const client = new GitHubClient(config);
    const operations = new GitHubOperations(client, config);
    
    const ignorePatterns = config.getIgnorePatterns();
    const projectPath = process.cwd();
    
    console.log('🚀 GitHub API - Batch Push\n');
    console.log('📁 Scanning project...');
    
    const allFiles = await getAllFiles(projectPath, ignorePatterns);
    console.log(`📦 Found ${allFiles.length} files to push\n`);
    
    const BATCH_SIZE = 50;
    let successCount = 0;
    
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);
      
      console.log(`\n📤 Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
      
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
          console.warn(`⚠️  Skipping ${filePath}: ${error}`);
          return null;
        }
      }).filter(f => f !== null) as { path: string; content: string }[];
      
      if (fileContents.length === 0) {
        console.log('   ⏭️  Batch empty, skipping...');
        continue;
      }
      
      const result = await operations.pushFiles(
        fileContents,
        `Update batch ${batchNum}/${totalBatches} - ${fileContents.length} files`
      );
      
      if (result.success) {
        successCount += fileContents.length;
        console.log(`   ✅ Pushed ${fileContents.length} files (Total: ${successCount}/${allFiles.length})`);
      } else {
        console.error(`   ❌ Failed: ${result.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n🎉 Done! Successfully pushed ${successCount}/${allFiles.length} files`);
    console.log(`🔗 Repository: https://github.com/${config.getDefaultOwner()}/${config.getDefaultRepo()}\n`);
    
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

pushInBatches();
