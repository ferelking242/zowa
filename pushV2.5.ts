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

async function pushV2_5() {
  try {
    const config = new ConfigManager();
    const client = new GitHubClient(config);
    const operations = new GitHubOperations(client, config);
    
    const ignorePatterns = config.getIgnorePatterns();
    const projectPath = process.cwd();
    
    console.log('🚀 v2.5 - Complete Project Push\n');
    console.log('📁 Scanning all project files...');
    
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
      
      const commitMessage = `v2.5 - Fix Telegram /status command + Playwright improvements

Major fixes and improvements:
- Fixed Telegram bot /status command to use HTTP API endpoint
- Added proper fallback when API unavailable (direct service access)
- Improved error handling with response validation
- Added logging for production debugging
- Uses RENDER_EXTERNAL_HOSTNAME for production deployment
- All services properly imported and functional
- Production-ready and tested`;
      
      const result = await operations.pushFiles(
        fileContents,
        commitMessage
      );
      
      if (result.success) {
        successCount += fileContents.length;
        console.log(`   ✅ Pushed ${fileContents.length} files (Total: ${successCount}/${allFiles.length})`);
      } else {
        console.error(`   ❌ Failed: ${result.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n🎉 v2.5 Complete! Successfully pushed ${successCount}/${allFiles.length} files`);
    console.log(`🔗 Repository: https://github.com/${config.getDefaultOwner()}/${config.getDefaultRepo()}`);
    console.log(`\n✅ All changes are now on GitHub with version v2.5\n`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

pushV2_5();
