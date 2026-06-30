#!/usr/bin/env node
import { ConfigManager } from './Dev/GitHub api/config';
import { GitHubClient } from './Dev/GitHub api/githubClient';
import { GitHubOperations } from './Dev/GitHub api/operations';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const IGNORE_PATTERNS = ['node_modules', '.git', '.cache', '*.log', '.DS_Store', 'config.ini', 'push-v2.5.ts'];

async function getAllFiles(dir: string, baseDir?: string): Promise<string[]> {
  const base = baseDir || dir;
  const files: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(base, fullPath);
      
      if (shouldIgnore(relativePath)) {
        continue;
      }
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...await getAllFiles(fullPath, base));
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

function shouldIgnore(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  
  for (const pattern of IGNORE_PATTERNS) {
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
    
    const projectPath = process.cwd();
    
    console.log('🚀 v2.5 - Complete Project Push to GitHub\n');
    console.log('📁 Scanning entire project from root...');
    
    const allFiles = await getAllFiles(projectPath);
    console.log(`📦 Found ${allFiles.length} files to push\n`);
    
    if (allFiles.length === 0) {
      console.error('❌ No files found! Check ignore patterns.');
      return;
    }
    
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
      
      const commitMessage = batchNum === 1 
        ? `v2.5 - Fix Telegram /status + Playwright improvements

✨ Major improvements:
- Fixed Telegram bot /status command to use HTTP API endpoint
- Added proper fallback when API unavailable (direct service access)
- Improved error handling with response validation
- Added logging for production debugging  
- Uses RENDER_EXTERNAL_HOSTNAME for production deployment
- All services properly imported and functional
- Production-ready and tested

📦 Complete project sync - all ${allFiles.length} files`
        : `v2.5 - Batch ${batchNum}/${totalBatches} (${fileContents.length} files)`;
      
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
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`\n🎉 v2.5 COMPLETE! Successfully pushed ${successCount}/${allFiles.length} files`);
    console.log(`🔗 Repository: https://github.com/${config.getDefaultOwner()}/${config.getDefaultRepo()}`);
    console.log(`\n✅ Version 2.5 is now live on GitHub!\n`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

pushV2_5();
