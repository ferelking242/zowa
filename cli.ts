#!/usr/bin/env node
import { ConfigManager } from './config';
import { GitHubClient } from './githubClient';
import { GitHubOperations } from './operations';
import { ProjectSync } from './syncProject';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const config = new ConfigManager();
    const client = new GitHubClient(config);
    const operations = new GitHubOperations(client, config);
    const sync = new ProjectSync(operations, config);

    console.log('🚀 GitHub API - Universal Tool\n');

    switch (command) {
      case 'sync':
      case 'push': {
        const projectPath = args[1] || process.cwd();
        const commitMessage = args[2] || undefined;
        
        console.log(`📁 Syncing project from: ${projectPath}`);
        console.log(`📝 Repository: ${config.getDefaultOwner()}/${config.getDefaultRepo()}\n`);
        
        const result = await sync.syncDirectory(projectPath, commitMessage);
        
        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.data) {
            console.log(`   Commit: ${result.data.commit}`);
            console.log(`   Files: ${result.data.filesCount}`);
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'create-repo': {
        const repoName = args[1];
        if (!repoName) {
          console.error('❌ Usage: cli.ts create-repo <repo-name>');
          process.exit(1);
        }
        
        const result = await operations.ensureRepo(repoName);
        console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
        break;
      }

      case 'update-file': {
        const filePath = args[1];
        const content = args[2];
        
        if (!filePath || !content) {
          console.error('❌ Usage: cli.ts update-file <path> <content>');
          process.exit(1);
        }
        
        const result = await operations.updateFile(filePath, content);
        console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
        break;
      }

      case 'help':
      default: {
        console.log('📖 Available Commands:\n');
        console.log('  sync [path] [message]     - Sync project to GitHub');
        console.log('  push [path] [message]     - Alias for sync');
        console.log('  create-repo <name>        - Create a new repository');
        console.log('  update-file <path> <text> - Update a single file');
        console.log('  help                      - Show this help\n');
        console.log('💡 Configuration is read from config.ini\n');
        break;
      }
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
