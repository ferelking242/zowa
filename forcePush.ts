import { ConfigManager } from './config.js';
import { GitHubClient } from './githubClient.js';
import { readFileSync } from 'fs';

const config = new ConfigManager();
const client = new GitHubClient(config);

async function forcePushFiles() {
  const owner = config.getDefaultOwner();
  const repo = config.getDefaultRepo();
  const branch = config.getDefaultBranch();
  
  const criticalFiles = [
    'server/services/keepAliveService.ts',
    'server/bot/telegram.ts',
    'server/services/emailService.ts',
    'server/routes.ts',
    'server/index.ts'
  ];

  console.log('🔥 FORCE PUSHING CRITICAL FILES');
  console.log(`📁 Repository: ${owner}/${repo}`);
  console.log(`🌿 Branch: ${branch}\n`);

  for (const filePath of criticalFiles) {
    try {
      console.log(`📤 Pushing ${filePath}...`);
      const content = readFileSync(filePath, 'utf-8');
      
      // Try to get existing file SHA (if exists)
      let sha: string | undefined;
      const existingFile = await client.getContent(owner, repo, filePath, branch);
      if (existingFile.success && existingFile.data?.sha) {
        sha = existingFile.data.sha;
        console.log(`   ℹ️  File exists, updating (SHA: ${sha.substring(0, 7)}...)`);
      } else {
        console.log(`   ℹ️  Creating new file`);
      }
      
      const result = await client.createOrUpdateFile(
        owner,
        repo,
        filePath,
        content,
        `[CRITICAL] Force update ${filePath} - Add missing features`,
        sha,
        branch
      );
      
      if (result.success) {
        console.log(`✅ ${filePath} pushed successfully (${content.length} bytes)\n`);
      } else {
        console.error(`❌ Failed to push ${filePath}: ${result.error}\n`);
      }
    } catch (error: any) {
      console.error(`❌ Failed to push ${filePath}:`, error.message, '\n');
    }
  }

  console.log('🎉 Force push completed!');
}

forcePushFiles().catch(console.error);
