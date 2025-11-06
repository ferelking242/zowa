import { Telegraf, Markup, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { storage } from '../services/supabaseStorage';
import { emailService } from '../services/emailService';
import { accountAutomationService } from '../services/accountAutomationService';
import { playwrightService } from '../services/playwrightService';
import { linkValidationService } from '../services/linkValidationService';
import type { User } from '@shared/schema';
import axios from 'axios';

interface BotContext extends Context {
  session?: {
    userId?: string;
    username?: string;
    email?: string;
    selectedNumber?: number;
    language?: string;
    rangeStart?: number;
    rangeEnd?: number;
    isRangeMode?: boolean;
    currentEmail?: string;
    lastEmailGeneratedMessages?: string[];
    lastCheckedMessages?: Map<string, string[]>;
  };
}

class TelegramBotService {
  private bot: Telegraf<BotContext> | null = null;
  private sessions: Map<number, any> = new Map();
  private isEnabled: boolean = false;
  private autoRefreshInterval: NodeJS.Timeout | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.warn('⚠️  [TELEGRAM] TELEGRAM_BOT_TOKEN not found in environment - Bot disabled');
      console.warn('⚠️  [TELEGRAM] Add TELEGRAM_BOT_TOKEN to .env to enable Telegram bot');
      this.isEnabled = false;
      return;
    }

    console.log('✅ [TELEGRAM] Token found, length:', token.length);
    this.isEnabled = true;
    this.bot = new Telegraf(token);
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private setupMiddleware() {
    if (!this.bot) return;
    
    this.bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id;
      if (chatId) {
        if (!this.sessions.has(chatId)) {
          this.sessions.set(chatId, { language: 'fr' });
        }
        ctx.session = this.sessions.get(chatId);
      }
      await next();
    });
  }

  private setupCommands() {
    if (!this.bot) return;
    
    this.bot.command('start', async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      const isLoggedIn = !!session?.userId;
      
      const welcomeMessage = lang === 'fr' 
        ? `👋 Bienvenue sur TempMail Pro Bot!\n\n` +
          `Je peux vous aider à gérer vos emails temporaires.\n\n` +
          `📧 Utilisez "Génère nouvel email" pour créer un email\n` +
          `📬 Utilisez "Inbox" pour voir vos messages\n` +
          `👤 Utilisez "Compte" pour vous connecter ou créer un compte\n` +
          `⚙️ Utilisez "Paramètres" pour configurer le bot`
        : `👋 Welcome to TempMail Pro Bot!\n\n` +
          `I can help you manage your temporary emails.\n\n` +
          `📧 Use "Generate new email" to create an email\n` +
          `📬 Use "Inbox" to see your messages\n` +
          `👤 Use "Account" to log in or create an account\n` +
          `⚙️ Use "Settings" to configure the bot`;

      await ctx.reply(welcomeMessage, this.getMainKeyboard(lang, isLoggedIn));
    });

    this.bot.command('login', async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      session.awaitingLogin = 'email';
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' 
        ? '📧 Veuillez entrer votre email:' 
        : '📧 Please enter your email:';
      
      await ctx.reply(msg);
    });

    this.bot.command('register', async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      session.awaitingRegister = 'email';
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' 
        ? '📝 Inscription - Étape 1/3\n\nEntrez votre email:' 
        : '📝 Registration - Step 1/3\n\nEnter your email:';
      
      await ctx.reply(msg);
    });

    this.bot.command('language', async (ctx) => {
      await ctx.reply('🌍 Choose your language / Choisissez votre langue:', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr')],
          [Markup.button.callback('🇬🇧 English', 'lang_en')],
        ])
      );
    });

    this.bot.command('inbox', async (ctx) => {
      await this.showInbox(ctx);
    });

    this.bot.command('logout', async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      delete session.userId;
      delete session.username;
      delete session.email;
      
      const msg = lang === 'fr' 
        ? '👋 Vous avez été déconnecté avec succès!' 
        : '👋 You have been logged out successfully!';
      
      await ctx.reply(msg, this.getMainKeyboard(lang, false));
    });

    this.bot.command('help', async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      const helpMessage = lang === 'fr'
        ? `📚 *Aide - TempMail Pro Bot*\n\n` +
          `*Commandes disponibles:*\n` +
          `/start - Menu principal\n` +
          `/login - Se connecter\n` +
          `/register - Créer un compte\n` +
          `/inbox - Voir vos emails\n` +
          `/profile - Voir votre profil\n` +
          `/tokens - Gérer vos API tokens\n` +
          `/history - Voir l'historique des emails\n` +
          `/settings - Paramètres\n` +
          `/language - Changer la langue\n` +
          `/logout - Se déconnecter\n` +
          `/help - Afficher cette aide\n\n` +
          `*Fonctionnalités:*\n` +
          `• Emails numérotés: username0@antdev.org - username1000000@antdev.org\n` +
          `• Détection automatique de nouveaux messages (refresh auto 5s)\n` +
          `• Détection et validation automatique de liens\n` +
          `• Gestion d'API tokens\n` +
          `• Historique des emails\n` +
          `• Support multilingue (FR/EN)`
        : `📚 *Help - TempMail Pro Bot*\n\n` +
          `*Available commands:*\n` +
          `/start - Main menu\n` +
          `/login - Log in\n` +
          `/register - Create account\n` +
          `/inbox - View your emails\n` +
          `/profile - View your profile\n` +
          `/tokens - Manage your API tokens\n` +
          `/history - View email history\n` +
          `/settings - Settings\n` +
          `/language - Change language\n` +
          `/logout - Log out\n` +
          `/help - Show this help\n\n` +
          `*Features:*\n` +
          `• Numbered emails: username0@antdev.org - username1000000@antdev.org\n` +
          `• Automatic new message detection (auto-refresh 5s)\n` +
          `• Automatic validation link detection and validation\n` +
          `• API token management\n` +
          `• Email history\n` +
          `• Multi-language support (FR/EN)`;
      
      await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    });

    this.bot.command('profile', async (ctx) => {
      await this.showProfile(ctx);
    });

    this.bot.command('settings', async (ctx) => {
      await this.showSettings(ctx);
    });

    this.bot.command('tokens', async (ctx) => {
      await this.showTokens(ctx);
    });

    this.bot.command('history', async (ctx) => {
      await this.showHistory(ctx);
    });

    this.bot.command('automation', async (ctx) => {
      await this.showAutomation(ctx);
    });

    this.bot.command('status', async (ctx) => {
      await this.showSystemStatus(ctx);
    });
  }

  private setupCallbacks() {
    if (!this.bot) return;
    
    this.bot.action(/lang_(.+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const lang = ctx.match[1];
      const session = this.sessions.get(ctx.chat.id);
      session.language = lang;
      
      const msg = lang === 'fr' 
        ? '✅ Langue changée en Français' 
        : '✅ Language changed to English';
      
      await ctx.answerCbQuery();
      await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
    });

    this.bot.action(/email_(\d+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const number = parseInt(ctx.match[1]);
      const session = this.sessions.get(ctx.chat.id);
      session.selectedNumber = number;
      
      await ctx.answerCbQuery();
      await this.showEmailDetails(ctx, number);
    });

    this.bot.action('inbox', async (ctx) => {
      await ctx.answerCbQuery();
      await this.showInbox(ctx);
    });

    this.bot.action('refresh', async (ctx) => {
      await ctx.answerCbQuery('🔄 Actualisation...');
      await this.refreshAndNotifyNewMessages(ctx);
    });

    this.bot.action('create_email', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (session.userId) {
        session.awaitingEmailNumber = true;
        const msg = lang === 'fr' 
          ? '🔢 Entrez le numéro pour votre nouvel email (0-1000000):' 
          : '🔢 Enter the number for your new email (0-1000000):';
        await ctx.answerCbQuery();
        await ctx.reply(msg);
      } else {
        session.awaitingNewEmail = true;
        const msg = lang === 'fr' 
          ? `📧 *Générer un nouvel email*\n\nEntrez l'adresse email que vous souhaitez créer.\n\n💡 Format: username@antdev.org ou username123@antdev.org`
          : `📧 *Generate new email*\n\nEnter the email address you want to create.\n\n💡 Format: username@antdev.org or username123@antdev.org`;
        await ctx.answerCbQuery();
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      }
    });

    this.bot.action('change_email', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      session.awaitingEmailAddress = true;
      
      const msg = lang === 'fr' 
        ? '📧 Entrez l\'adresse email que vous souhaitez consulter:\n\nExemple: username@antdev.org ou username123@antdev.org' 
        : '📧 Enter the email address you want to check:\n\nExample: username@antdev.org or username123@antdev.org';
      
      await ctx.answerCbQuery();
      await ctx.reply(msg);
    });

    this.bot.action('settings_language', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🌍 Choose your language / Choisissez votre langue:', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🇫🇷 Français', 'lang_fr')],
          [Markup.button.callback('🇬🇧 English', 'lang_en')],
        ])
      );
    });

    this.bot.action('settings_notifications', async (ctx) => {
      const session = this.sessions.get(ctx.chat?.id || 0);
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr'
        ? '🔔 Les notifications sont actuellement activées.\n\nCette fonctionnalité est en développement.'
        : '🔔 Notifications are currently enabled.\n\nThis feature is under development.';
      
      await ctx.answerCbQuery(msg, { show_alert: true });
    });

    this.bot.action('settings_back', async (ctx) => {
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat?.id || 0);
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' ? '⬅️ Retour au menu principal' : '⬅️ Back to main menu';
      await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
    });

    this.bot.action('account_login', async (ctx) => {
      if (!ctx.chat) return;
      
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      session.awaitingLogin = 'email';
      const msg = lang === 'fr' ? '📧 Veuillez entrer votre email:' : '📧 Please enter your email:';
      await ctx.reply(msg);
    });

    this.bot.action('account_register', async (ctx) => {
      if (!ctx.chat) return;
      
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      session.awaitingRegister = 'email';
      const msg = lang === 'fr' 
        ? '📝 Inscription - Étape 1/3\n\nEntrez votre email:' 
        : '📝 Registration - Step 1/3\n\nEnter your email:';
      await ctx.reply(msg);
    });

    this.bot.action('account_logout', async (ctx) => {
      if (!ctx.chat) return;
      
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      delete session.userId;
      delete session.username;
      delete session.email;
      
      const msg = lang === 'fr' 
        ? '👋 Vous avez été déconnecté avec succès!' 
        : '👋 You have been logged out successfully!';
      
      await ctx.reply(msg, this.getMainKeyboard(lang, false));
    });

    this.bot.action('account_back', async (ctx) => {
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat?.id || 0);
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' ? '⬅️ Retour au menu principal' : '⬅️ Back to main menu';
      await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
    });

    this.bot.action('view_guest_messages', async (ctx) => {
      await ctx.answerCbQuery();
      await this.showEmailDetails(ctx);
    });

    this.bot.action('generate_new', async (ctx) => {
      await ctx.answerCbQuery();
      await this.generateRandomEmail(ctx);
    });

    this.bot.action(/copy_(.+)/, async (ctx) => {
      const email = ctx.match[1];
      const session = this.sessions.get(ctx.chat?.id || 0);
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' 
        ? `📋 Email copié:\n\n\`${email}\`\n\nCollez-le où vous voulez!` 
        : `📋 Email copied:\n\n\`${email}\`\n\nPaste it anywhere!`;
      
      await ctx.answerCbQuery(lang === 'fr' ? '✅ Copié!' : '✅ Copied!');
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    this.bot.action('toggle_auto_validation', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (!session?.userId) {
        await ctx.answerCbQuery(
          lang === 'fr' ? '❌ Connectez-vous pour accéder à ce paramètre' : '❌ Log in to access this setting',
          { show_alert: true }
        );
        return;
      }

      const user = await storage.getUserById(session.userId);
      if (user) {
        const newValue = !user.autoValidateInbox;
        await storage.updateUserSettings(session.userId, newValue);
        
        await ctx.answerCbQuery(
          lang === 'fr' 
            ? `✅ Auto-validation ${newValue ? 'activée' : 'désactivée'}` 
            : `✅ Auto-validation ${newValue ? 'enabled' : 'disabled'}`
        );
        
        await this.showSettings(ctx);
      }
    });

    this.bot.action('configure_range', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (!session?.userId) {
        await ctx.answerCbQuery(
          lang === 'fr' ? '❌ Connectez-vous pour accéder à ce paramètre' : '❌ Log in to access this setting',
          { show_alert: true }
        );
        return;
      }

      await ctx.answerCbQuery();

      const msg = lang === 'fr'
        ? `📈 *Configuration de la plage*\n\n` +
          `Entrez la plage de séquences à surveiller au format:\n\n` +
          `\`début-fin\`\n\n` +
          `Exemple: \`20-130\` pour surveiller de ${session.username}20 à ${session.username}130\n\n` +
          `Maximum 100 emails à la fois.\n\n` +
          `Pour désactiver le mode plage, envoyez: \`0-9\``
        : `📈 *Range Configuration*\n\n` +
          `Enter the sequence range to monitor in the format:\n\n` +
          `\`start-end\`\n\n` +
          `Example: \`20-130\` to monitor from ${session.username}20 to ${session.username}130\n\n` +
          `Maximum 100 emails at a time.\n\n` +
          `To disable range mode, send: \`0-9\``;

      session.awaitingRange = true;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    this.bot.action(/range_prev_(\d+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const currentStart = parseInt(ctx.match[1]);
      
      const newEnd = Math.max(0, currentStart - 1);
      const newStart = Math.max(0, newEnd - 9);
      
      session.rangeStart = newStart;
      session.rangeEnd = newEnd;
      
      await ctx.answerCbQuery('⬅️');
      await this.showInbox(ctx);
    });

    this.bot.action(/range_next_(\d+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const currentEnd = parseInt(ctx.match[1]);
      
      const newStart = Math.min(1000000, currentEnd + 1);
      const newEnd = Math.min(1000000, newStart + 9);
      
      session.rangeStart = newStart;
      session.rangeEnd = newEnd;
      
      await ctx.answerCbQuery('➡️');
      await this.showInbox(ctx);
    });

    this.bot.action('create_token', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (!session?.userId) {
        await ctx.answerCbQuery(
          lang === 'fr' ? '❌ Connectez-vous d\'abord' : '❌ Log in first',
          { show_alert: true }
        );
        return;
      }

      await ctx.answerCbQuery();
      
      const msg = lang === 'fr'
        ? '🔑 Création d\'un nouveau token\n\nEntrez un nom pour votre token (optionnel, tapez "skip" pour ignorer):'
        : '🔑 Creating a new token\n\nEnter a name for your token (optional, type "skip" to skip):';
      
      session.awaitingTokenName = true;
      await ctx.reply(msg);
    });

    this.bot.action('delete_token', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (!session?.userId) {
        await ctx.answerCbQuery(
          lang === 'fr' ? '❌ Connectez-vous d\'abord' : '❌ Log in first',
          { show_alert: true }
        );
        return;
      }

      await ctx.answerCbQuery();
      
      const tokens = await storage.getApiTokensByUserId(session.userId);
      
      if (tokens.length === 0) {
        await ctx.reply(
          lang === 'fr' ? '❌ Aucun token à supprimer' : '❌ No tokens to delete'
        );
        return;
      }
      
      const msg = lang === 'fr'
        ? '🗑️ Suppression de token\n\nEntrez le numéro du token à supprimer:'
        : '🗑️ Delete token\n\nEnter the number of the token to delete:';
      
      session.awaitingTokenDelete = true;
      await ctx.reply(msg);
    });

    this.bot.action('close_menu', async (ctx) => {
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat?.id || 0);
      const lang = session?.language || 'fr';
      
      const msg = lang === 'fr' ? '✅ Menu fermé' : '✅ Menu closed';
      await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
    });
    
    this.bot.action(/view_message_(.+)/, async (ctx) => {
      if (!ctx.chat) return;
      await ctx.answerCbQuery();
      
      const messageId = ctx.match[1];
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      const messageData = session?.lastMessageData?.get(messageId);
      
      if (!messageData) {
        const msg = lang === 'fr' 
          ? '❌ Message introuvable' 
          : '❌ Message not found';
        await ctx.reply(msg);
        return;
      }
      
      const formattedMessage = this.formatEmailForTelegram(messageData, lang);
      await ctx.reply(formattedMessage, { 
        parse_mode: 'HTML'
      });
    });
    
    this.bot.action(/validation_done_(.+)/, async (ctx) => {
      await ctx.answerCbQuery(
        ctx.session?.language === 'fr' ? '✅ Validation terminée' : '✅ Validation completed'
      );
    });

    this.bot.action('automation_toggle_debug', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      session.automationDebugMode = !session.automationDebugMode;
      const lang = session?.language || 'fr';
      
      const msg = session.automationDebugMode
        ? (lang === 'fr' ? '🔍 Mode debug activé' : '🔍 Debug mode enabled')
        : (lang === 'fr' ? '✨ Mode normal activé' : '✨ Normal mode enabled');
      
      await ctx.answerCbQuery(msg);
      await this.showAutomation(ctx);
    });

    this.bot.action('automation_replit_single', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      await ctx.answerCbQuery();
      
      let email: string;
      if (session?.userId && session?.username) {
        const randomNum = Math.floor(Math.random() * 1000000);
        email = `${session.username}${randomNum}@antdev.org`;
      } else {
        email = this.generateRandomEmailAddress();
      }
      
      const startMsg = lang === 'fr'
        ? `🚀 *Démarrage de l'automatisation Replit*\n\n📧 Email: ${email}\n\n⏳ L'automatisation est en cours...`
        : `🚀 *Starting Replit automation*\n\n📧 Email: ${email}\n\n⏳ Automation in progress...`;
      
      const statusMessage = await ctx.reply(startMsg, { parse_mode: 'Markdown' });
      
      try {
        const debugMode = session?.automationDebugMode || false;
        accountAutomationService.setDebugMode(debugMode);
        
        const { taskId } = await accountAutomationService.createReplitAccount(email);
        let sentLogs = new Set<string>();
        let sentScreenshotHashes = new Set<string>();
        
        const processUpdate = async (task: any) => {
          try {
            if (debugMode) {
            for (const log of task.debugLogs) {
              if (!sentLogs.has(log)) {
                sentLogs.add(log);
                await ctx.reply(log, { parse_mode: 'Markdown' }).catch(() => {});
              }
            }

            for (const screenshot of task.screenshots) {
              const hash = screenshot.substring(0, 100);
              if (!sentScreenshotHashes.has(hash)) {
                sentScreenshotHashes.add(hash);
                try {
                  const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
                  const buffer = Buffer.from(base64Data, 'base64');
                  const screenshotNum = sentScreenshotHashes.size;
                  const caption = lang === 'fr' 
                    ? `📸 Capture ${screenshotNum}` 
                    : `📸 Screenshot ${screenshotNum}`;
                  
                  await ctx.replyWithPhoto(
                    { source: buffer },
                    { caption }
                  ).catch((photoError) => {
                    console.error('❌ [TELEGRAM] Failed to send screenshot:', photoError);
                  });
                } catch (photoError) {
                  console.error('❌ [TELEGRAM] Failed to prepare screenshot:', photoError);
                }
              }
            }
          } else {
            const stepsText = task.steps.map((step: any) => {
                const icon = step.status === 'completed' ? '✅' : 
                            step.status === 'running' ? '⏳' : 
                            step.status === 'failed' ? '❌' : '⚪';
                return `${icon} *${step.label}*`;
              }).join('\n');

              const statusText = lang === 'fr'
                ? `🤖 *Automatisation Replit*\n\n📧 Email: ${task.email}\n\n${stepsText}`
                : `🤖 *Replit Automation*\n\n📧 Email: ${task.email}\n\n${stepsText}`;

              try {
                await ctx.telegram.editMessageText(
                  ctx.chat!.id,
                  statusMessage.message_id,
                  undefined,
                  statusText,
                  { parse_mode: 'Markdown' }
                );
              } catch (editError) {
                
              }
          }

          if (task.status === 'completed') {
              const successMsg = lang === 'fr'
                ? `\n\n✅ *Automatisation terminée avec succès!*`
                : `\n\n✅ *Automation completed successfully!*`;
              
              if (!debugMode) {
                const finalText = lang === 'fr'
                  ? `🤖 *Automatisation Replit*\n\n📧 Email: ${task.email}\n\n` +
                    task.steps.map((s: any) => `✅ *${s.label}*`).join('\n') + successMsg
                  : `🤖 *Replit Automation*\n\n📧 Email: ${task.email}\n\n` +
                    task.steps.map((s: any) => `✅ *${s.label}*`).join('\n') + successMsg;
                
                try {
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    statusMessage.message_id,
                    undefined,
                    finalText,
                    { parse_mode: 'Markdown' }
                  );
                } catch (e) {
                  await ctx.reply(successMsg, { parse_mode: 'Markdown' });
                }
              } else {
                await ctx.reply(successMsg, { parse_mode: 'Markdown' });
              }
            } else if (task.status === 'failed') {
              const errorMsg = lang === 'fr'
                ? `\n\n❌ *Automatisation échouée*`
                : `\n\n❌ *Automation failed*`;
              
              if (!debugMode) {
                const finalText = lang === 'fr'
                  ? `🤖 *Automatisation Replit*\n\n📧 Email: ${task.email}\n\n` +
                    task.steps.map((step: any) => {
                      const icon = step.status === 'completed' ? '✅' : 
                                  step.status === 'failed' ? '❌' : '⚪';
                      return `${icon} *${step.label}*`;
                    }).join('\n') + errorMsg
                  : `🤖 *Replit Automation*\n\n📧 Email: ${task.email}\n\n` +
                    task.steps.map((step: any) => {
                      const icon = step.status === 'completed' ? '✅' : 
                                  step.status === 'failed' ? '❌' : '⚪';
                      return `${icon} *${step.label}*`;
                    }).join('\n') + errorMsg;
                
                try {
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    statusMessage.message_id,
                    undefined,
                    finalText,
                    { parse_mode: 'Markdown' }
                  );
                } catch (e) {
                  await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
                }
              } else {
                await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
              }
          }
          } catch (updateError) {
            console.error('❌ [TELEGRAM] Error sending update:', updateError);
          }
        };

        accountAutomationService.onTaskUpdate(taskId, async (task) => {
          await processUpdate(task);
        });
        
      } catch (error: any) {
        const errorMsg = lang === 'fr'
          ? `❌ Erreur lors de l'automatisation: ${error.message}`
          : `❌ Automation error: ${error.message}`;
        
        await ctx.reply(errorMsg);
      }
    });

    this.bot.action('automation_replit_multiple', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      await ctx.answerCbQuery();
      
      const msg = lang === 'fr'
        ? '🔢 Combien de comptes souhaitez-vous créer?\n\nEntrez un nombre (1-10):'
        : '🔢 How many accounts do you want to create?\n\nEnter a number (1-10):';
      
      session.awaitingAccountCount = true;
      await ctx.reply(msg);
    });
  }

  private formatEmailForTelegram(message: any, lang: string): string {
    const from = message.fromAddress || (lang === 'fr' ? 'Inconnu' : 'Unknown');
    const subject = message.subject || (lang === 'fr' ? 'Pas de sujet' : 'No subject');
    const date = message.createdAt ? new Date(message.createdAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') : '';
    
    let content = '';
    
    if (message.htmlContent) {
      content = message.htmlContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<img[^>]*>/gi, '🖼️ [Image]')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, '<b>📌 $2</b>\n\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<strong[^>]*>/gi, '<b>')
        .replace(/<\/strong>/gi, '</b>')
        .replace(/<em[^>]*>/gi, '<i>')
        .replace(/<\/em>/gi, '</i>')
        .replace(/<(p|div|span|td|li)[^>]*>/gi, '')
        .replace(/<\/?(table|tbody|tr|ul|ol)[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    } else if (message.textContent) {
      content = message.textContent.trim();
    } else {
      content = lang === 'fr' ? '❌ Aucun contenu disponible' : '❌ No content available';
    }
    
    const links = emailService.extractLinksFromMessage(message);
    let linksSection = '';
    if (links.length > 0) {
      // Filtrer seulement les vrais liens de vérification Replit (action-code?mode=verifyEmail)
      const replitVerificationLinks = links.filter(link => 
        (link.includes('replit.com') || link.includes('repl.it')) && 
        link.includes('action-code') && 
        link.includes('mode=verifyEmail')
      );
      const otherLinks = links.filter(link => 
        !(link.includes('replit.com') || link.includes('repl.it')) ||
        (!link.includes('action-code') || !link.includes('mode=verifyEmail'))
      );
      
      linksSection = '\n\n━━━━━━━━━━━━━━━\n';
      
      if (replitVerificationLinks.length > 0) {
        linksSection += (lang === 'fr' ? '<b>🔗 Liens Replit:</b>' : '<b>🔗 Replit Links:</b>') + '\n';
        replitVerificationLinks.forEach((link, index) => {
          const linkText = link.length > 45 ? link.substring(0, 42) + '...' : link;
          linksSection += `  🟠 <a href="${link}">${linkText}</a>\n`;
        });
      }
    }
    
    const maxContentLength = 3000 - linksSection.length - 400;
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '...\n\n' + (lang === 'fr' ? '📄 [Message tronqué - trop long]' : '📄 [Message truncated - too long]');
    }
    
    const header = lang === 'fr' 
      ? `┏━━━━━❮ 📧 EMAIL ❯━━━━━┓\n`
      : `┏━━━━━❮ 📧 EMAIL ❯━━━━━┓\n`;
    
    const footer = `┗━━━━━━━━━━━━━━━━━━━┛`;
    
    return header +
           `┃ <b>👤 ${lang === 'fr' ? 'De' : 'From'}:</b> ${from}\n` +
           `┃ <b>📝 ${lang === 'fr' ? 'Sujet' : 'Subject'}:</b> ${subject}\n` +
           (date ? `┃ <b>🕐 Date:</b> ${date}\n` : '') +
           `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
           `${content}` +
           linksSection +
           (linksSection ? '\n━━━━━━━━━━━━━━━' : '');
  }

  private startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    console.log('🔄 [TELEGRAM] Starting auto-refresh every 5 seconds');
    
    this.autoRefreshInterval = setInterval(async () => {
      const activeSessions = Array.from(this.sessions.entries()).filter(
        ([_, session]) => session.currentEmail || session.userId
      );

      for (const [chatId, session] of activeSessions) {
        try {
          const emailToCheck = session.userId 
            ? `${session.username}@antdev.org` 
            : session.currentEmail;
          
          if (!emailToCheck) continue;

          if (!session.lastCheckedMessages) {
            session.lastCheckedMessages = new Map();
          }

          const previousMessageIds = session.lastCheckedMessages.get(emailToCheck) || [];
          const messages = await emailService.getMessages(emailToCheck);
          const currentMessageIds = messages.map(m => m.id);
          
          const newMessages = messages.filter(m => !previousMessageIds.includes(m.id));
          
          session.lastCheckedMessages.set(emailToCheck, currentMessageIds);

          if (newMessages.length > 0 && this.bot) {
            const lang = session?.language || 'fr';
            
            for (const msg of newMessages) {
              console.log(`📧 [TELEGRAM AUTO-REFRESH] Processing new message ${msg.id} for chat ${chatId}`);
              
              // Get full message details including content
              const fullMessage = await emailService.getMessageDetails(msg.id);
              if (!fullMessage) continue;
              
              const validationLinks = emailService.extractLinksFromMessage(fullMessage);
              const hasValidationLink = validationLinks.length > 0;
              
              console.log(`🔗 [TELEGRAM AUTO-REFRESH] Found ${validationLinks.length} validation links`);
              
              const shortMsg = lang === 'fr'
                ? `📬 Nouveau message reçu`
                : `📬 New message received`;
              
              const buttons = [];
              
              buttons.push([Markup.button.callback(
                lang === 'fr' ? '📖 Voir le message' : '📖 View message',
                `view_message_${msg.id}`
              )]);
              
              if (hasValidationLink) {
                console.log(`🎯 [TELEGRAM AUTO-REFRESH] Starting auto-validation for message ${msg.id}`);
                
                try {
                  const { linkValidationService } = await import('../services/linkValidationService');
                  await linkValidationService.validateLinksInMessage(msg.id);
                  console.log(`✅ [TELEGRAM AUTO-REFRESH] Auto-validation completed for message ${msg.id}`);
                  
                  buttons.push([Markup.button.callback(
                    lang === 'fr' ? '✅ Lien validé' : '✅ Link validated',
                    `validation_done_${msg.id}`
                  )]);
                } catch (error) {
                  console.error(`❌ [TELEGRAM AUTO-REFRESH] Auto-validation failed for message ${msg.id}:`, error);
                  
                  buttons.push([Markup.button.url(
                    lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                    validationLinks[0]
                  )]);
                }
              }
              
              await this.bot.telegram.sendMessage(chatId, shortMsg, Markup.inlineKeyboard(buttons));
              
              session.lastMessageData = session.lastMessageData || new Map();
              session.lastMessageData.set(msg.id, fullMessage);
            }
            
            console.log(`✅ [TELEGRAM AUTO-REFRESH] Notified chat ${chatId} about ${newMessages.length} new message(s)`);
          }
        } catch (error) {
          console.error(`❌ [TELEGRAM AUTO-REFRESH] Error checking messages for chat ${chatId}:`, error);
        }
      }
    }, 5000);
  }

  private stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('🛑 [TELEGRAM] Auto-refresh stopped');
    }
  }

  private async refreshAndNotifyNewMessages(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (!session?.currentEmail && !session?.userId) {
      await this.showInbox(ctx);
      return;
    }

    const emailToCheck = session.userId 
      ? `${session.username}@antdev.org` 
      : session.currentEmail;
    
    if (!emailToCheck) {
      await this.showInbox(ctx);
      return;
    }

    if (!session.lastCheckedMessages) {
      session.lastCheckedMessages = new Map();
    }

    const previousMessageIds = session.lastCheckedMessages.get(emailToCheck) || [];
    const messages = await emailService.getMessages(emailToCheck);
    const currentMessageIds = messages.map(m => m.id);
    
    const newMessages = messages.filter(m => !previousMessageIds.includes(m.id));
    
    session.lastCheckedMessages.set(emailToCheck, currentMessageIds);

    if (newMessages.length > 0) {
      for (const msg of newMessages) {
        // Get full message details including content
        const fullMessage = await emailService.getMessageDetails(msg.id);
        if (!fullMessage) continue;
        
        const validationLinks = emailService.extractLinksFromMessage(fullMessage);
        const hasValidationLink = validationLinks.length > 0;
        
        const shortNotification = lang === 'fr'
          ? `📬 Nouveau message de ${msg.fromAddress}\n📝 ${msg.subject}`
          : `📬 New message from ${msg.fromAddress}\n📝 ${msg.subject}`;
        
        await ctx.reply(shortNotification);
        
        const formattedMessage = this.formatEmailForTelegram(fullMessage, lang);
        await ctx.reply(formattedMessage, { parse_mode: 'HTML' });
        
        if (hasValidationLink) {
          try {
            const { linkValidationService } = await import('../services/linkValidationService');
            await linkValidationService.validateLinksInMessage(msg.id);
            
            const validationMsg = lang === 'fr'
              ? '✅ Lien de validation auto-validé!'
              : '✅ Validation link auto-validated!';
            await ctx.reply(validationMsg);
          } catch (error) {
            console.error('❌ [TELEGRAM] Auto-validation failed:', error);
          }
        }
      }
      
      const summaryMsg = lang === 'fr'
        ? `✅ ${newMessages.length} nouveau(x) message(s) trouvé(s)`
        : `✅ ${newMessages.length} new message(s) found`;
      
      await ctx.reply(summaryMsg);
    } else {
      const noNewMsg = lang === 'fr'
        ? '✅ Aucun nouveau message'
        : '✅ No new messages';
      
      await ctx.reply(noNewMsg);
    }
    
    await this.showInbox(ctx);
  }

  private async showInbox(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (!session?.currentEmail && !session?.userId) {
      const msg = lang === 'fr' 
        ? '📬 *Inbox*\n\nPour voir votre inbox, entrez une adresse email.\n\nExemple: username@antdev.org ou username123@antdev.org' 
        : '📬 *Inbox*\n\nTo view your inbox, enter an email address.\n\nExample: username@antdev.org or username123@antdev.org';
      
      session.awaitingEmailAddress = true;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      return;
    }

    if (session.userId) {
      const username = session.username;
      const domain = 'antdev.org';
      
      const rangeStart = session.isRangeMode ? (session.rangeStart || 0) : 0;
      const rangeEnd = session.isRangeMode ? (session.rangeEnd || 9) : 9;
      
      const actualEnd = Math.min(rangeEnd, rangeStart + 99);
      
      const emails = [];
      for (let i = rangeStart; i <= actualEnd; i++) {
        const email = i === 0 ? `${username}@${domain}` : `${username}${i}@${domain}`;
        const messages = await emailService.getMessages(email);
        if (messages.length > 0) {
          emails.push({ number: i, count: messages.length });
        }
      }

      const rangeInfo = session.isRangeMode 
        ? `📈 Plage active: ${rangeStart}-${rangeEnd}\n` 
        : '';

      const msg = lang === 'fr'
        ? `📬 Inbox de ${username}\n\n` +
          `Email principal: ${username}@${domain}\n` +
          `Emails disponibles: ${username}0@${domain} - ${username}1000000@${domain}\n` +
          rangeInfo + `\n` +
          `📊 Emails actifs: ${emails.length}`
        : `📬 Inbox for ${username}\n\n` +
          `Main email: ${username}@${domain}\n` +
          `Available emails: ${username}0@${domain} - ${username}1000000@${domain}\n` +
          rangeInfo + `\n` +
          `📊 Active emails: ${emails.length}`;

      const keyboard = [];
      
      const numbersToShow = [];
      for (let i = rangeStart; i <= rangeEnd && numbersToShow.length < 10; i++) {
        numbersToShow.push(i);
      }

      const row1 = [];
      for (let i = 0; i < Math.min(5, numbersToShow.length); i++) {
        const num = numbersToShow[i];
        const hasMessages = emails.find(e => e.number === num);
        const label = num === 0 ? '@' : `${num}`;
        const badge = hasMessages ? `${label} (${hasMessages.count})` : label;
        row1.push(Markup.button.callback(badge, `email_${num}`));
      }
      if (row1.length > 0) keyboard.push(row1);

      const row2 = [];
      for (let i = 5; i < numbersToShow.length; i++) {
        const num = numbersToShow[i];
        const hasMessages = emails.find(e => e.number === num);
        const badge = hasMessages ? `${num} (${hasMessages.count})` : `${num}`;
        row2.push(Markup.button.callback(badge, `email_${num}`));
      }
      if (row2.length > 0) keyboard.push(row2);

      const navigationButtons = [];
      
      if (rangeStart > 0) {
        navigationButtons.push(Markup.button.callback('⬅️ Précédent', `range_prev_${rangeStart}`));
      }
      
      navigationButtons.push(Markup.button.callback('🔄', 'refresh'));
      
      if (rangeEnd < 1000000) {
        navigationButtons.push(Markup.button.callback('➡️ Suivant', `range_next_${rangeEnd}`));
      }
      
      keyboard.push(navigationButtons);
      
      keyboard.push([
        Markup.button.callback(lang === 'fr' ? '➕ Créer Email' : '➕ Create Email', 'create_email'),
        Markup.button.callback(lang === 'fr' ? '⚙️ Configurer plage' : '⚙️ Configure range', 'configure_range'),
      ]);

      await ctx.reply(msg, Markup.inlineKeyboard(keyboard));
    } else {
      const email = session.currentEmail!;
      const messages = await emailService.getMessages(email);

      const msg = lang === 'fr'
        ? `📬 Inbox: ${email}\n\n` +
          `📊 Messages: ${messages.length}\n\n` +
          `💡 Connectez-vous pour gérer plusieurs emails simultanément`
        : `📬 Inbox: ${email}\n\n` +
          `📊 Messages: ${messages.length}\n\n` +
          `💡 Log in to manage multiple emails simultaneously`;

      const keyboard = [];
      
      if (messages.length > 0) {
        keyboard.push([
          Markup.button.callback(
            lang === 'fr' ? '📧 Voir les messages' : '📧 View messages', 
            'view_guest_messages'
          )
        ]);
      }

      keyboard.push([
        Markup.button.callback(lang === 'fr' ? '📧 Autre Email' : '📧 Other Email', 'change_email'),
        Markup.button.callback('🔄', 'refresh'),
      ]);

      await ctx.reply(msg, Markup.inlineKeyboard(keyboard));
    }
  }

  private async showEmailDetails(ctx: BotContext, number?: number) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    let email: string;
    if (session.userId && number !== undefined) {
      const username = session.username;
      const domain = 'antdev.org';
      email = number === 0 ? `${username}@${domain}` : `${username}${number}@${domain}`;
    } else if (session.currentEmail) {
      email = session.currentEmail;
    } else {
      return;
    }
    
    const messages = await emailService.getMessages(email);

    if (messages.length === 0) {
      const msg = lang === 'fr' 
        ? `📭 Aucun message pour ${email}` 
        : `📭 No messages for ${email}`;
      
      await ctx.reply(msg, Markup.inlineKeyboard([
        [
          Markup.button.callback(lang === 'fr' ? '⬅️ Retour' : '⬅️ Back', 'inbox'),
          Markup.button.callback(lang === 'fr' ? '❌ Fermer' : '❌ Close', 'close_menu'),
        ]
      ]));
      return;
    }

    const now = new Date();
    const date = now.toLocaleDateString('fr-FR');
    const time = now.toLocaleTimeString('fr-FR');

    const headerMsg = lang === 'fr'
      ? `📬 *Inbox: ${email}*\n\n📊 Total: ${messages.length} message(s)\n📅 ${date}, ${time}\n\n`
      : `📬 *Inbox: ${email}*\n\n📊 Total: ${messages.length} message(s)\n📅 ${date}, ${time}\n\n`;

    await ctx.reply(headerMsg, { parse_mode: 'Markdown' });

    for (const m of messages.slice(0, 3)) {
      const fullMessage = await emailService.getMessageDetails(m.id);
      if (!fullMessage) continue;
      
      const timeAgo = this.formatTimeAgo(m.createdAt, lang);
      const shortInfo = lang === 'fr'
        ? `━━━━━━━━━━━━━━━\n📧 *De:* ${m.fromAddress}\n📝 *Sujet:* ${m.subject}\n🕐 ${timeAgo}`
        : `━━━━━━━━━━━━━━━\n📧 *From:* ${m.fromAddress}\n📝 *Subject:* ${m.subject}\n🕐 ${timeAgo}`;
      
      await ctx.reply(shortInfo, { parse_mode: 'Markdown' });
      
      const formattedMessage = this.formatEmailForTelegram(fullMessage, lang);
      await ctx.reply(formattedMessage, { parse_mode: 'HTML' });
      
      const validationLinks = emailService.extractLinksFromMessage(fullMessage);
      // Filtrer seulement les vrais liens de vérification Replit
      const replitVerificationLinks = validationLinks.filter(link => 
        (link.includes('replit.com') || link.includes('repl.it')) && 
        link.includes('action-code') && 
        link.includes('mode=verifyEmail')
      );
      
      if (replitVerificationLinks.length > 0) {
        const autoValidateMsg = lang === 'fr'
          ? `🟠 ${replitVerificationLinks.length} lien(s) Replit détecté(s) - Auto-validation en cours...`
          : `🟠 ${replitVerificationLinks.length} Replit link(s) detected - Auto-validation in progress...`;
        await ctx.reply(autoValidateMsg);
        
        try {
          const { linkValidationService } = await import('../services/linkValidationService');
          const validations = await linkValidationService.validateLinksInMessage(m.id);
          
          const successMsg = lang === 'fr'
            ? `✅ Auto-validation terminée! ${validations.length} lien(s) validé(s)`
            : `✅ Auto-validation completed! ${validations.length} link(s) validated`;
          await ctx.reply(successMsg);
        } catch (error) {
          console.error('❌ [TELEGRAM] Auto-validation error:', error);
          const errorMsg = lang === 'fr'
            ? `⚠️ Erreur lors de l'auto-validation`
            : `⚠️ Error during auto-validation`;
          await ctx.reply(errorMsg);
        }
      }
    }

    if (messages.length > 3) {
      const remainingMsg = lang === 'fr' 
        ? `... et ${messages.length - 3} autre(s) message(s)\n\nUtilisez 🔄 Rafraîchir pour mettre à jour` 
        : `... and ${messages.length - 3} more message(s)\n\nUse 🔄 Refresh to update`;
      
      await ctx.reply(remainingMsg);
    }

    await ctx.reply('━━━━━━━━━━━━━━━', Markup.inlineKeyboard([
      [Markup.button.callback(lang === 'fr' ? '🔄 Rafraîchir' : '🔄 Refresh', 'refresh')],
      [
        Markup.button.callback(lang === 'fr' ? '⬅️ Retour' : '⬅️ Back', 'inbox'),
        Markup.button.callback(lang === 'fr' ? '❌ Fermer' : '❌ Close', 'close_menu'),
      ]
    ]));
  }

  private getMainKeyboard(lang: string, isLoggedIn: boolean) {
    return Markup.keyboard([
      [lang === 'fr' ? '📧 Génère nouvel email' : '📧 Generate new email'],
      [lang === 'fr' ? '📁 Charger email' : '📁 Load email', lang === 'fr' ? '📬 Inbox' : '📬 Inbox'],
      [lang === 'fr' ? '🔄 Rafraîchir' : '🔄 Refresh', lang === 'fr' ? '👤 Compte' : '👤 Account'],
      [lang === 'fr' ? '⚙️ Paramètres' : '⚙️ Settings', lang === 'fr' ? '🤖 Automatisation' : '🤖 Automation'],
    ]).resize().persistent();
  }

  private generateRandomEmailAddress(): string {
    const adjectives = ["cool", "fast", "blue", "red", "zen", "soft", "gold", "dark", "lite", "deep"];
    const nouns = ["cat", "dog", "fox", "owl", "bee", "ray", "sky", "sun", "moon", "star"];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 99);
    return `${randomAdj}${randomNoun}${randomNum}@antdev.org`;
  }

  private async generateRandomEmail(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    const email = this.generateRandomEmailAddress();
    session.currentEmail = email;
    session.lastEmailGeneratedMessages = [];
    
    const msg = lang === 'fr'
      ? `📧 Nouvel email:\n\n\`${email}\`\n\n✅ Tapez sur l'email ci-dessus pour le copier`
      : `📧 New email:\n\n\`${email}\`\n\n✅ Tap the email above to copy it`;

    await ctx.reply(msg, { 
      parse_mode: 'Markdown',
      reply_markup: this.getMainKeyboard(lang, !!session.userId).reply_markup
    });
  }

  private formatTimeAgo(timestamp: number, lang: string): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (lang === 'fr') {
      if (days > 0) return `il y a ${days}j`;
      if (hours > 0) return `il y a ${hours}h`;
      if (minutes > 0) return `il y a ${minutes}m`;
      return "à l'instant";
    } else {
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return "just now";
    }
  }

  private async showProfile(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (!session?.userId) {
      const msg = lang === 'fr' 
        ? '🔒 Vous devez être connecté pour voir votre profil.\n\nUtilisez /login pour vous connecter.' 
        : '🔒 You must be logged in to view your profile.\n\nUse /login to log in.';
      
      await ctx.reply(msg);
      return;
    }

    const user = await storage.getUserById(session.userId);
    if (!user) {
      const msg = lang === 'fr' ? '❌ Utilisateur non trouvé' : '❌ User not found';
      await ctx.reply(msg);
      return;
    }

    const createdDate = new Date(user.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US');
    
    const profileMsg = lang === 'fr'
      ? `👤 *Votre Profil*\n\n` +
        `📧 Email: ${user.email}\n` +
        `👤 Nom d'utilisateur: ${user.username}\n` +
        `📬 Email principal: ${user.username}@antdev.org\n` +
        `📅 Membre depuis: ${createdDate}\n\n` +
        `✨ Emails disponibles:\n` +
        `• ${user.username}@antdev.org\n` +
        `• ${user.username}0@antdev.org\n` +
        `• ${user.username}1@antdev.org\n` +
        `• ... ${user.username}1000000@antdev.org`
      : `👤 *Your Profile*\n\n` +
        `📧 Email: ${user.email}\n` +
        `👤 Username: ${user.username}\n` +
        `📬 Main email: ${user.username}@antdev.org\n` +
        `📅 Member since: ${createdDate}\n\n` +
        `✨ Available emails:\n` +
        `• ${user.username}@antdev.org\n` +
        `• ${user.username}0@antdev.org\n` +
        `• ${user.username}1@antdev.org\n` +
        `• ... ${user.username}1000000@antdev.org`;

    await ctx.reply(profileMsg, { parse_mode: 'Markdown' });
  }

  private async showAccount(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (session?.userId) {
      const user = await storage.getUserById(session.userId);
      
      if (user) {
        const createdDate = new Date(user.createdAt).toLocaleDateString('fr-FR');
        const createdTime = new Date(user.createdAt).toLocaleTimeString('fr-FR');
        
        const profileMsg = lang === 'fr'
          ? `🌹⃝━❮ Compte Utilisateur ❯━\n` +
            `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
            `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
            `⊹ ☪︎⋆ Compte Actif ✅\n` +
            `┊ ${createdDate}, ${createdTime}\n` +
            `✧\n\n` +
            `┏━❮ Informations ❯━\n` +
            `┃⛤┃📧 Email: ${user.email}\n` +
            `┃⛤┃👤 Username: ${user.username}\n` +
            `┃⛤┃📬 Email Principal: ${user.username}@antdev.org\n` +
            `┃⛤┃📅 Membre depuis: ${createdDate}\n` +
            `┃⛤┃🔔 Status: Connecté\n` +
            `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
            `╰──────────────`
          : `🌹⃝━❮ User Account ❯━\n` +
            `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
            `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
            `⊹ ☪︎⋆ Active Account ✅\n` +
            `┊ ${createdDate}, ${createdTime}\n` +
            `✧\n\n` +
            `┏━❮ Information ❯━\n` +
            `┃⛤┃📧 Email: ${user.email}\n` +
            `┃⛤┃👤 Username: ${user.username}\n` +
            `┃⛤┃📬 Main Email: ${user.username}@antdev.org\n` +
            `┃⛤┃📅 Member since: ${createdDate}\n` +
            `┃⛤┃🔔 Status: Connected\n` +
            `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
            `╰──────────────`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(
            lang === 'fr' ? '🚪 Déconnexion' : '🚪 Logout',
            'account_logout'
          )],
          [
            Markup.button.callback(
              lang === 'fr' ? '⬅️ Retour' : '⬅️ Back',
              'account_back'
            ),
            Markup.button.callback(
              lang === 'fr' ? '❌ Fermer' : '❌ Close',
              'close_menu'
            ),
          ],
        ]);

        await ctx.reply(profileMsg, keyboard);
      }
    } else {
      const msg = lang === 'fr'
        ? `🌹⃝━❮ Compte ❯━\n` +
          `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
          `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
          `⊹ ☪︎⋆ Non Connecté ⚠️\n` +
          `✧\n\n` +
          `Vous n'êtes pas connecté.\n\n` +
          `Connectez-vous pour accéder à votre inbox personnalisée et gérer vos emails.`
        : `🌹⃝━❮ Account ❯━\n` +
          `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
          `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
          `⊹ ☪︎⋆ Not Connected ⚠️\n` +
          `✧\n\n` +
          `You are not logged in.\n\n` +
          `Log in to access your personalized inbox and manage your emails.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(
          lang === 'fr' ? '🔑 Connexion' : '🔑 Login',
          'account_login'
        )],
        [Markup.button.callback(
          lang === 'fr' ? '📝 Inscription' : '📝 Register',
          'account_register'
        )],
        [
          Markup.button.callback(
            lang === 'fr' ? '⬅️ Retour' : '⬅️ Back',
            'account_back'
          ),
          Markup.button.callback(
            lang === 'fr' ? '❌ Fermer' : '❌ Close',
            'close_menu'
          ),
        ],
      ]);

      await ctx.reply(msg, keyboard);
    }
  }

  private async showSettings(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';

    let autoValidation = false;
    if (session?.userId) {
      const user = await storage.getUserById(session.userId);
      autoValidation = user?.autoValidateInbox ?? false;
    }

    const settingsMsg = lang === 'fr'
      ? `🌹⃝━❮ Paramètres ❯━\n` +
        `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
        `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
        `⊹ ☪︎⋆ Configuration ⚙️\n` +
        `✧\n\n` +
        `┏━❮ Options ❯━\n` +
        `┃⛤┃🌍 Langue: ${session.language === 'fr' ? 'Français 🇫🇷' : 'English 🇬🇧'}\n` +
        `┃⛤┃✅ Auto-validation: ${autoValidation ? 'Activée ✅' : 'Désactivée ❌'}\n` +
        `┃⛤┃🔔 Notifications: Actives\n` +
        `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
        `╰──────────────`
      : `🌹⃝━❮ Settings ❯━\n` +
        `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
        `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
        `⊹ ☪︎⋆ Configuration ⚙️\n` +
        `✧\n\n` +
        `┏━❮ Options ❯━\n` +
        `┃⛤┃🌍 Language: ${session.language === 'fr' ? 'Français 🇫🇷' : 'English 🇬🇧'}\n` +
        `┃⛤┃✅ Auto-validation: ${autoValidation ? 'Enabled ✅' : 'Disabled ❌'}\n` +
        `┃⛤┃🔔 Notifications: Active\n` +
        `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
        `╰──────────────`;

    const buttons = [
      [Markup.button.callback(
        lang === 'fr' ? '🌍 Changer la langue' : '🌍 Change language',
        'settings_language'
      )],
    ];

    if (session?.userId) {
      buttons.push([Markup.button.callback(
        lang === 'fr' ? `✅ Auto-validation: ${autoValidation ? 'ON' : 'OFF'}` : `✅ Auto-validation: ${autoValidation ? 'ON' : 'OFF'}`,
        'toggle_auto_validation'
      )]);
      
      const rangeText = session.isRangeMode 
        ? `📈 Plage: ${session.rangeStart || 0}-${session.rangeEnd || 9}` 
        : '📊 Mode Plage: OFF';
      buttons.push([Markup.button.callback(
        lang === 'fr' ? rangeText : rangeText,
        'configure_range'
      )]);
    }

    buttons.push([
      Markup.button.callback(
        lang === 'fr' ? '⬅️ Retour' : '⬅️ Back',
        'settings_back'
      ),
      Markup.button.callback(
        lang === 'fr' ? '❌ Fermer' : '❌ Close',
        'close_menu'
      ),
    ]);

    await ctx.reply(settingsMsg, Markup.inlineKeyboard(buttons));
  }

  private async showTokens(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (!session?.userId) {
      const msg = lang === 'fr' 
        ? '🔒 Vous devez être connecté pour gérer vos API tokens.\n\nUtilisez /login pour vous connecter.' 
        : '🔒 You must be logged in to manage your API tokens.\n\nUse /login to log in.';
      
      await ctx.reply(msg);
      return;
    }

    const tokens = await storage.getApiTokensByUserId(session.userId);
    
    const msg = lang === 'fr'
      ? `🔑 Vos API Tokens\n\n` +
        `📊 Total: ${tokens.length} token(s)\n\n` +
        (tokens.length > 0 
          ? tokens.map((t: any, i: number) => 
              `${i + 1}. ${t.name || 'Token sans nom'}\n` +
              `   🔐 ${t.token.substring(0, 8)}...${t.token.substring(t.token.length - 4)}\n` +
              `   📅 Créé: ${new Date(t.createdAt).toLocaleDateString('fr-FR')}`
            ).join('\n\n')
          : '💡 Aucun token créé. Créez-en un pour accéder à l\'API!')
      : `🔑 Your API Tokens\n\n` +
        `📊 Total: ${tokens.length} token(s)\n\n` +
        (tokens.length > 0 
          ? tokens.map((t: any, i: number) => 
              `${i + 1}. ${t.name || 'Unnamed token'}\n` +
              `   🔐 ${t.token.substring(0, 8)}...${t.token.substring(t.token.length - 4)}\n` +
              `   📅 Created: ${new Date(t.createdAt).toLocaleDateString('en-US')}`
            ).join('\n\n')
          : '💡 No tokens created. Create one to access the API!');

    const buttons = [
      [Markup.button.callback(
        lang === 'fr' ? '➕ Créer Token' : '➕ Create Token',
        'create_token'
      )],
    ];

    if (tokens.length > 0) {
      buttons.push([Markup.button.callback(
        lang === 'fr' ? '🗑️ Supprimer Token' : '🗑️ Delete Token',
        'delete_token'
      )]);
    }

    buttons.push([Markup.button.callback(
      lang === 'fr' ? '❌ Fermer' : '❌ Close',
      'close_menu'
    )]);

    await ctx.reply(msg, Markup.inlineKeyboard(buttons));
  }

  private async showHistory(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    if (!session?.userId) {
      const msg = lang === 'fr' 
        ? '🔒 Vous devez être connecté pour voir votre historique.\n\nUtilisez /login pour vous connecter.' 
        : '🔒 You must be logged in to view your history.\n\nUse /login to log in.';
      
      await ctx.reply(msg);
      return;
    }

    const history = await storage.getEmailHistory(session.userId);
    
    const msg = lang === 'fr'
      ? `📜 Historique des Emails\n\n` +
        `📊 Total: ${history.length} email(s)\n\n` +
        (history.length > 0 
          ? history.slice(0, 10).map((h, i) => 
              `${i + 1}. ${h.email}\n` +
              `   📧 Messages: ${h.messageCount}\n` +
              `   🕐 Dernière vérification: ${new Date(h.lastChecked).toLocaleString('fr-FR')}`
            ).join('\n\n')
          : '💡 Aucun email dans l\'historique')
      : `📜 Email History\n\n` +
        `📊 Total: ${history.length} email(s)\n\n` +
        (history.length > 0 
          ? history.slice(0, 10).map((h, i) => 
              `${i + 1}. ${h.email}\n` +
              `   📧 Messages: ${h.messageCount}\n` +
              `   🕐 Last checked: ${new Date(h.lastChecked).toLocaleString('en-US')}`
            ).join('\n\n')
          : '💡 No emails in history');

    await ctx.reply(msg, Markup.inlineKeyboard([
      [Markup.button.callback(
        lang === 'fr' ? '❌ Fermer' : '❌ Close',
        'close_menu'
      )],
    ]));
  }

  private async showAutomation(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    const debugMode = session?.automationDebugMode || false;
    
    const automationMsg = lang === 'fr'
      ? `🤖 *Automatisation de Comptes*\n\n` +
        `Créez automatiquement des comptes avec Playwright.\n\n` +
        `*Providers disponibles:*\n` +
        `• Replit (https://replit.com/signup)\n\n` +
        `*Mode actuel:* ${debugMode ? '🔍 Debug (logs complets)' : '✨ Normal (étapes uniquement)'}\n\n` +
        `Sélectionnez un provider pour commencer:`
      : `🤖 *Account Automation*\n\n` +
        `Automatically create accounts with Playwright.\n\n` +
        `*Available providers:*\n` +
        `• Replit (https://replit.com/signup)\n\n` +
        `*Current mode:* ${debugMode ? '🔍 Debug (full logs)' : '✨ Normal (steps only)'}\n\n` +
        `Select a provider to start:`;

    await ctx.reply(automationMsg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(
          '🔵 Replit - Un compte',
          'automation_replit_single'
        )],
        [Markup.button.callback(
          '🔵🔵 Replit - Plusieurs comptes',
          'automation_replit_multiple'
        )],
        [Markup.button.callback(
          debugMode ? '✨ Mode Normal' : '🔍 Mode Debug',
          'automation_toggle_debug'
        )],
        [Markup.button.callback(
          lang === 'fr' ? '❌ Fermer' : '❌ Close',
          'close_menu'
        )],
      ]).reply_markup
    });
  }

  private async showSystemStatus(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    const loadingMsg = lang === 'fr'
      ? '🔍 Vérification du système...'
      : '🔍 Checking system status...';
    
    const loadingMessage = await ctx.reply(loadingMsg);
    
    try {
      let activeBrowsers = 0;
      let maxBrowsers = 2;
      let status = 'unknown';
      let duration = 0;
      let serverStatus = '';
      
      try {
        const port = process.env.PORT || '5000';
        const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME 
          ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
          : `http://localhost:${port}`;
        const apiUrl = `${baseUrl}/api/status`;
        
        console.log(`[TELEGRAM /status] Calling ${apiUrl}...`);
        const startTime = Date.now();
        const response = await axios.get(apiUrl, { timeout: 10000 });
        duration = Date.now() - startTime;
        
        if (response.data && typeof response.data === 'object') {
          activeBrowsers = response.data.activeBrowsers || 0;
          maxBrowsers = response.data.maxBrowsers || 2;
          status = response.data.status || 'unknown';
          serverStatus = lang === 'fr' ? '🌐 Via API' : '🌐 Via API';
          console.log(`[TELEGRAM /status] API call successful: ${JSON.stringify(response.data)}`);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (httpError: any) {
        console.log(`[TELEGRAM /status] HTTP call failed, using direct service access: ${httpError.message}`);
        const startTime = Date.now();
        activeBrowsers = await linkValidationService.getActiveBrowserCount();
        duration = Date.now() - startTime;
        status = 'online';
        serverStatus = lang === 'fr' ? '🔧 Direct' : '🔧 Direct';
      }
      
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      
      const statusEmoji = status === 'online' ? '✅' : (status === 'unknown' ? '⚠️' : '❌');
      const statusText = status === 'online' 
        ? (lang === 'fr' ? 'En ligne' : 'Online') 
        : (status === 'unknown' ? (lang === 'fr' ? 'Inconnu' : 'Unknown') : (lang === 'fr' ? 'Hors ligne' : 'Offline'));
      
      const statusMsg = lang === 'fr'
        ? `📊 *État du Système*\n\n` +
          `🤖 *Bot Telegram:* ✅ En ligne\n` +
          `⏱️ *Uptime:* ${uptimeHours}h ${uptimeMinutes}min\n\n` +
          `${serverStatus} *Serveur:* ${statusEmoji} ${statusText}\n` +
          `🔄 Navigateurs actifs: ${activeBrowsers}/${maxBrowsers}\n` +
          `⚡ Temps de réponse: ${duration}ms\n\n` +
          `💡 Utilisez /help pour voir toutes les commandes`
        : `📊 *System Status*\n\n` +
          `🤖 *Telegram Bot:* ✅ Online\n` +
          `⏱️ *Uptime:* ${uptimeHours}h ${uptimeMinutes}min\n\n` +
          `${serverStatus} *Server:* ${statusEmoji} ${statusText}\n` +
          `🔄 Active browsers: ${activeBrowsers}/${maxBrowsers}\n` +
          `⚡ Response time: ${duration}ms\n\n` +
          `💡 Use /help to see all commands`;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        statusMsg,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      console.error(`[TELEGRAM /status] Unexpected error: ${error.message}`, error);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        lang === 'fr' 
          ? `❌ Erreur lors de la vérification: ${error.message}`
          : `❌ Check error: ${error.message}`
      );
    }
  }

  async start() {
    if (!this.isEnabled || !this.bot) {
      console.log('ℹ️  [TELEGRAM] Bot is disabled - skipping initialization');
      return;
    }

    try {
      this.bot.on(message('text'), async (ctx) => {
        if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      const text = ctx.message.text;

      if (text === '📬 Inbox' || text.includes('Inbox')) {
        await this.showInbox(ctx);
        return;
      }

      if (text === '📧 Génère nouvel email' || text === '📧 Generate new email') {
        await this.generateRandomEmail(ctx);
        return;
      }

      if (text === '📁 Charger email' || text === '📁 Load email') {
        session.awaitingEmailAddress = true;
        const msg = lang === 'fr' 
          ? '📁 Entrez l\'adresse email que vous souhaitez charger:\n\nExemple: username@antdev.org ou username123@antdev.org' 
          : '📁 Enter the email address you want to load:\n\nExample: username@antdev.org or username123@antdev.org';
        await ctx.reply(msg);
        return;
      }

      if (text === '👤 Compte' || text === '👤 Account') {
        await this.showAccount(ctx);
        return;
      }

      if (text === '⚙️ Paramètres' || text === '⚙️ Settings') {
        await this.showSettings(ctx);
        return;
      }

      if (text === '🔄 Rafraîchir' || text === '🔄 Refresh') {
        await this.refreshAndNotifyNewMessages(ctx);
        return;
      }

      if (text === '🤖 Automatisation' || text === '🤖 Automation') {
        await this.showAutomation(ctx);
        return;
      }

      if (session.awaitingNewEmail) {
        const emailPattern = /^[a-zA-Z0-9]+\d*@antdev\.org$/;
        if (!emailPattern.test(text)) {
          const msg = lang === 'fr' 
            ? '❌ Format invalide. Utilisez: username@antdev.org ou username123@antdev.org' 
            : '❌ Invalid format. Use: username@antdev.org or username123@antdev.org';
          await ctx.reply(msg);
          return;
        }
        
        delete session.awaitingNewEmail;
        session.currentEmail = text;
        
        const msg = lang === 'fr' 
          ? `✅ Email ${text} généré avec succès!\n\nVous pouvez maintenant utiliser "📬 Inbox" pour voir vos messages.` 
          : `✅ Email ${text} created successfully!\n\nYou can now use "📬 Inbox" to see your messages.`;
        
        await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
        return;
      }

      if (session.awaitingEmailAddress) {
        const emailPattern = /^[a-zA-Z0-9]+\d*@antdev\.org$/;
        if (!emailPattern.test(text)) {
          const msg = lang === 'fr' 
            ? '❌ Format invalide. Utilisez: username@antdev.org ou username123@antdev.org' 
            : '❌ Invalid format. Use: username@antdev.org or username123@antdev.org';
          await ctx.reply(msg);
          return;
        }
        
        // Vérifier si l'utilisateur a déjà un email actif
        if (session.currentEmail && session.currentEmail !== text) {
          session.pendingEmailChange = text;
          delete session.awaitingEmailAddress;
          
          const confirmMsg = lang === 'fr'
            ? `⚠️ Vous avez déjà un email actif: ${session.currentEmail}\n\nVoulez-vous le remplacer par: ${text} ?\n\nTapez "oui" pour confirmer ou "non" pour annuler.`
            : `⚠️ You already have an active email: ${session.currentEmail}\n\nDo you want to replace it with: ${text} ?\n\nType "yes" to confirm or "no" to cancel.`;
          
          session.awaitingEmailChangeConfirmation = true;
          await ctx.reply(confirmMsg);
          return;
        }
        
        delete session.awaitingEmailAddress;
        session.currentEmail = text;
        
        await this.showInbox(ctx);
        return;
      }

      if (session.awaitingEmailChangeConfirmation) {
        const confirmed = text.toLowerCase() === 'oui' || text.toLowerCase() === 'yes';
        
        delete session.awaitingEmailChangeConfirmation;
        
        if (confirmed && session.pendingEmailChange) {
          session.currentEmail = session.pendingEmailChange;
          delete session.pendingEmailChange;
          
          const msg = lang === 'fr'
            ? `✅ Email changé avec succès vers: ${session.currentEmail}`
            : `✅ Email successfully changed to: ${session.currentEmail}`;
          
          await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
          await this.showInbox(ctx);
        } else {
          delete session.pendingEmailChange;
          
          const msg = lang === 'fr'
            ? '❌ Changement d\'email annulé'
            : '❌ Email change cancelled';
          
          await ctx.reply(msg, this.getMainKeyboard(lang, !!session.userId));
        }
        return;
      }

      if (session.awaitingEmailNumber) {
        const number = parseInt(text);
        if (isNaN(number) || number < 0 || number > 1000000) {
          const msg = lang === 'fr' 
            ? '❌ Numéro invalide. Doit être entre 0 et 1000000.' 
            : '❌ Invalid number. Must be between 0 and 1000000.';
          await ctx.reply(msg);
          return;
        }
        
        delete session.awaitingEmailNumber;
        const email = number === 0 
          ? `${session.username}@antdev.org` 
          : `${session.username}${number}@antdev.org`;
        
        const msg = lang === 'fr' 
          ? `✅ Email ${email} créé avec succès!` 
          : `✅ Email ${email} created successfully!`;
        
        await ctx.reply(msg, this.getMainKeyboard(lang, true));
        return;
      }

      if (session.awaitingRange) {
        const rangePattern = /^(\d+)-(\d+)$/;
        const match = text.match(rangePattern);
        
        if (!match) {
          const msg = lang === 'fr' 
            ? '❌ Format invalide. Utilisez: début-fin (exemple: 20-130)' 
            : '❌ Invalid format. Use: start-end (example: 20-130)';
          await ctx.reply(msg);
          return;
        }
        
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        
        if (start < 0 || end > 1000000 || start > end) {
          const msg = lang === 'fr' 
            ? '❌ Plage invalide. Début doit être < fin, et entre 0 et 1000000.' 
            : '❌ Invalid range. Start must be < end, and between 0 and 1000000.';
          await ctx.reply(msg);
          return;
        }
        
        if (end - start >= 100) {
          const msg = lang === 'fr' 
            ? '❌ La plage ne peut pas dépasser 100 emails. Maximum: 100 emails à la fois.' 
            : '❌ Range cannot exceed 100 emails. Maximum: 100 emails at a time.';
          await ctx.reply(msg);
          return;
        }
        
        delete session.awaitingRange;
        session.rangeStart = start;
        session.rangeEnd = end;
        session.isRangeMode = !(start === 0 && end === 9);
        
        const msg = lang === 'fr' 
          ? `✅ Plage configurée: ${start}-${end}\n\n` +
            `Vous surveillez maintenant ${session.username}${start} à ${session.username}${end}\n\n` +
            (session.isRangeMode ? '📈 Mode plage activé' : '📊 Mode normal activé')
          : `✅ Range configured: ${start}-${end}\n\n` +
            `You are now monitoring ${session.username}${start} to ${session.username}${end}\n\n` +
            (session.isRangeMode ? '📈 Range mode enabled' : '📊 Normal mode enabled');
        
        await ctx.reply(msg, this.getMainKeyboard(lang, true));
        return;
      }

      if (session.awaitingLogin === 'email') {
        session.loginEmail = text;
        session.awaitingLogin = 'password';
        const msg = lang === 'fr' ? '🔑 Veuillez entrer votre mot de passe:' : '🔑 Please enter your password:';
        await ctx.reply(msg);
        return;
      }

      if (session.awaitingLogin === 'password') {
        const user = await storage.verifyPassword(session.loginEmail, text);
        
        if (user) {
          session.userId = user.id;
          session.username = user.username;
          session.email = user.email;
          delete session.awaitingLogin;
          delete session.loginEmail;
          
          const msg = lang === 'fr' 
            ? `✅ Connexion réussie!\n\nBienvenue ${user.username}!` 
            : `✅ Login successful!\n\nWelcome ${user.username}!`;
          
          await ctx.reply(msg, this.getMainKeyboard(lang, true));
        } else {
          delete session.awaitingLogin;
          delete session.loginEmail;
          
          const msg = lang === 'fr' 
            ? '❌ Email ou mot de passe incorrect. Utilisez /login pour réessayer.' 
            : '❌ Invalid email or password. Use /login to try again.';
          
          await ctx.reply(msg);
        }
        return;
      }

      if (session.awaitingRegister === 'email') {
        session.registerEmail = text;
        session.awaitingRegister = 'username';
        const msg = lang === 'fr' 
          ? '📝 Inscription - Étape 2/3\n\nEntrez votre nom d\'utilisateur (lettres uniquement, pas de chiffres):' 
          : '📝 Registration - Step 2/3\n\nEnter your username (letters only, no digits):';
        await ctx.reply(msg);
        return;
      }

      if (session.awaitingRegister === 'username') {
        if (!/^[a-zA-Z]{3,20}$/.test(text)) {
          const msg = lang === 'fr' 
            ? '❌ Le nom d\'utilisateur doit contenir 3-20 lettres (pas de chiffres).' 
            : '❌ Username must contain 3-20 letters (no digits).';
          await ctx.reply(msg);
          return;
        }
        
        const existing = await storage.getUserByUsername(text);
        if (existing) {
          const msg = lang === 'fr' 
            ? '❌ Ce nom d\'utilisateur est déjà pris.' 
            : '❌ This username is already taken.';
          await ctx.reply(msg);
          return;
        }
        
        session.registerUsername = text;
        session.awaitingRegister = 'password';
        const msg = lang === 'fr' 
          ? '📝 Inscription - Étape 3/3\n\nEntrez votre mot de passe (minimum 8 caractères):' 
          : '📝 Registration - Step 3/3\n\nEnter your password (minimum 8 characters):';
        await ctx.reply(msg);
        return;
      }

      if (session.awaitingRegister === 'password') {
        if (text.length < 8) {
          const msg = lang === 'fr' 
            ? '❌ Le mot de passe doit contenir au moins 8 caractères.' 
            : '❌ Password must be at least 8 characters.';
          await ctx.reply(msg);
          return;
        }
        
        try {
          const user = await storage.createUser({
            email: session.registerEmail,
            username: session.registerUsername,
            password: text,
          });
          
          session.userId = user.id;
          session.username = user.username;
          session.email = user.email;
          delete session.awaitingRegister;
          delete session.registerEmail;
          delete session.registerUsername;
          
          const msg = lang === 'fr' 
            ? `🎉 Inscription réussie!\n\nBienvenue ${user.username}!\n\nVotre email principal: ${user.username}@antdev.org` 
            : `🎉 Registration successful!\n\nWelcome ${user.username}!\n\nYour main email: ${user.username}@antdev.org`;
          
          await ctx.reply(msg, this.getMainKeyboard(lang, true));
        } catch (error: any) {
          delete session.awaitingRegister;
          delete session.registerEmail;
          delete session.registerUsername;
          
          const msg = lang === 'fr' 
            ? `❌ Erreur lors de l'inscription: ${error.message}` 
            : `❌ Registration error: ${error.message}`;
          
          await ctx.reply(msg);
        }
        return;
      }

      if (session.awaitingTokenName) {
        delete session.awaitingTokenName;
        
        const tokenName = text.toLowerCase() === 'skip' ? undefined : text;
        
        try {
          const token = await storage.createApiToken(session.userId!, tokenName);
          
          const msg = lang === 'fr'
            ? `✅ Token créé avec succès!\n\n🔐 Token: \`${token.token}\`\n\n⚠️ Copiez-le maintenant, il ne sera plus affiché!`
            : `✅ Token created successfully!\n\n🔐 Token: \`${token.token}\`\n\n⚠️ Copy it now, it won't be shown again!`;
          
          await ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (error: any) {
          const msg = lang === 'fr'
            ? `❌ Erreur lors de la création du token: ${error.message}`
            : `❌ Error creating token: ${error.message}`;
          
          await ctx.reply(msg);
        }
        return;
      }

      if (session.awaitingTokenDelete) {
        delete session.awaitingTokenDelete;
        
        const tokenIndex = parseInt(text) - 1;
        
        if (isNaN(tokenIndex)) {
          const msg = lang === 'fr'
            ? '❌ Numéro invalide.'
            : '❌ Invalid number.';
          
          await ctx.reply(msg);
          return;
        }
        
        try {
          const tokens = await storage.getApiTokensByUserId(session.userId!);
          
          if (tokenIndex < 0 || tokenIndex >= tokens.length) {
            const msg = lang === 'fr'
              ? `❌ Token ${tokenIndex + 1} n'existe pas.`
              : `❌ Token ${tokenIndex + 1} does not exist.`;
            
            await ctx.reply(msg);
            return;
          }
          
          const tokenToDelete = tokens[tokenIndex];
          await storage.deleteApiToken(tokenToDelete.id, session.userId!);
          
          const msg = lang === 'fr'
            ? `✅ Token supprimé avec succès!`
            : `✅ Token deleted successfully!`;
          
          await ctx.reply(msg);
        } catch (error: any) {
          const msg = lang === 'fr'
            ? `❌ Erreur lors de la suppression du token: ${error.message}` 
            : `❌ Error deleting token: ${error.message}`;
          
          await ctx.reply(msg);
        }
        return;
      }

      if (session.awaitingAccountCount) {
        delete session.awaitingAccountCount;
        
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 10) {
          const msg = lang === 'fr' 
            ? '❌ Nombre invalide. Doit être entre 1 et 10.' 
            : '❌ Invalid number. Must be between 1 and 10.';
          await ctx.reply(msg);
          return;
        }
        
        const confirmMsg = lang === 'fr'
          ? `🚀 *Lancement de la création de ${count} compte(s) Replit*\n\n⏳ Les workers vont traiter les comptes en parallèle...\n\n📊 Vous recevrez des mises à jour régulières.`
          : `🚀 *Starting creation of ${count} Replit account(s)*\n\n⏳ Workers will process accounts in parallel...\n\n📊 You will receive regular updates.`;
        
        const statusMsg = await ctx.reply(confirmMsg, { parse_mode: 'Markdown' });
        
        try {
          const debugMode = session?.automationDebugMode || false;
          accountAutomationService.setDebugMode(debugMode);
          
          await accountAutomationService.createMultipleAccounts(count, (completed, total) => {
            const progressMsg = lang === 'fr'
              ? `📊 *Progression*\n\n✅ Complétés: ${completed}/${total}\n⏳ En cours: ${total - completed}`
              : `📊 *Progress*\n\n✅ Completed: ${completed}/${total}\n⏳ Remaining: ${total - completed}`;
            
            try {
              ctx.telegram.editMessageText(
                ctx.chat!.id,
                statusMsg.message_id,
                undefined,
                progressMsg,
                { parse_mode: 'Markdown' }
              ).catch(() => {});
            } catch (e) {
              
            }
            
            if (completed === total) {
              const finalMsg = lang === 'fr'
                ? `🎉 *Automatisation terminée!*\n\n✅ ${completed} compte(s) créé(s) avec succès!`
                : `🎉 *Automation completed!*\n\n✅ ${completed} account(s) created successfully!`;
              
              ctx.reply(finalMsg, { parse_mode: 'Markdown' });
            }
          });
        } catch (error: any) {
          const errorMsg = lang === 'fr'
            ? `❌ Erreur lors de la création multiple: ${error.message}`
            : `❌ Multiple creation error: ${error.message}`;
          
          await ctx.reply(errorMsg);
        }
        return;
        }
      });

      console.log('🤖 [TELEGRAM] Bot starting...');
      
      // Delete any existing webhook first
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('🔄 [TELEGRAM] Webhook deleted');
      
      // Launch bot in background (non-blocking)
      this.bot.launch({
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: true,
      }).then(() => {
        console.log('✅ [TELEGRAM] Bot polling started');
      }).catch((error) => {
        console.error('❌ [TELEGRAM] Bot launch error:', error);
      });
      
      console.log('✅ [TELEGRAM] Bot started successfully!');
      console.log('✅ [TELEGRAM] Ready to receive commands');

      this.startAutoRefresh();

      process.once('SIGINT', () => {
        console.log('🛑 [TELEGRAM] Stopping bot...');
        this.stopAutoRefresh();
        this.bot?.stop('SIGINT');
      });
      process.once('SIGTERM', () => {
        console.log('🛑 [TELEGRAM] Stopping bot...');
        this.stopAutoRefresh();
        this.bot?.stop('SIGTERM');
      });
    } catch (error) {
      console.error('❌ [TELEGRAM] Failed to start bot:', error);
      console.error('❌ [TELEGRAM] Veuillez vérifier votre TELEGRAM_BOT_TOKEN dans le fichier .env');
      console.error('❌ [TELEGRAM] Le bot Telegram ne sera pas disponible mais l\'application continuera de fonctionner');
    }
  }


  async sendNotification(chatId: number, message: string) {
    if (!this.bot) return;
    
    try {
      await this.bot.telegram.sendMessage(chatId, message);
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  async notifyNewMessage(userId: string, email: string, from: string, subject: string) {
    const sessions = Array.from(this.sessions.entries());
    const userSession = sessions.find(([_, session]) => session.userId === userId);
    
    if (!userSession) return;
    
    const [chatId, session] = userSession;
    const lang = session.language || 'fr';
    
    const msg = lang === 'fr'
      ? `📧 Nouveau message reçu!\n\n` +
        `📨 De: ${from}\n` +
        `📝 Sujet: ${subject}\n` +
        `📬 Email: ${email}`
      : `📧 New message received!\n\n` +
        `📨 From: ${from}\n` +
        `📝 Subject: ${subject}\n` +
        `📬 Email: ${email}`;
    
    await this.sendNotification(chatId, msg);
  }
}

export const telegramService = new TelegramBotService();
