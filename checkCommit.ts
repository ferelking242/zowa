import { ConfigManager } from './config.js';
import { GitHubAPIClient } from './github.js';

const config = ConfigManager.getInstance();
const client = new GitHubAPIClient(config);

async function checkLatestCommit() {
  const commits = await client.getCommits('main', 1);
  console.log('📋 DERNIER COMMIT:');
  console.log('Message:', commits[0].commit.message);
  console.log('Date:', commits[0].commit.author.date);
  console.log('SHA:', commits[0].sha);
  console.log('');
  
  // Vérifie les fichiers importants
  const files = [
    'server/bot/telegram.ts',
    'server/services/emailService.ts',
    'server/services/keepAliveService.ts',
    'server/routes.ts'
  ];
  
  console.log('📁 VÉRIFICATION DES FICHIERS CRITIQUES:');
  for (const file of files) {
    try {
      const content = await client.getFileContent(file);
      console.log(`✅ ${file}: ${content.length} caractères`);
      
      // Vérifie si /status est dans telegram.ts
      if (file === 'server/bot/telegram.ts' && content.includes('/status')) {
        console.log('   ✅ Commande /status trouvée!');
      } else if (file === 'server/bot/telegram.ts') {
        console.log('   ❌ Commande /status MANQUANTE!');
      }
      
      // Vérifie keepAliveService
      if (file === 'server/services/keepAliveService.ts') {
        console.log('   ✅ Keep-alive service présent!');
      }
    } catch (e: any) {
      console.log(`❌ ${file}: MANQUANT! (${e.message})`);
    }
  }
}

checkLatestCommit().catch(console.error);
