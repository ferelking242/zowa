import { Telegraf, Markup, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { storage } from '../services/supabaseStorage';
import { emailService } from '../services/emailService';
import { accountAutomationService } from '../services/accountAutomationService';
import { playwrightService } from '../services/playwrightService';
import { linkValidationService } from '../services/linkValidationService';
import { getAllDomains, EMAIL_PROVIDERS } from '@shared/email-providers';
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

  private getActiveEmail(session: any): string | null {
    if (session.currentEmail) {
      return session.currentEmail;
    }
    
    if (session.userId && session.username) {
      const domain = session.preferredDomain || getAllDomains()[0];
      return `${session.username}@${domain}`;
    }
    
    return null;
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
        ? `📧 <b>The Official TempMail Bot</b>\n` +
          `<i>From creators of the Legendary and Top#1 temporary email service</i>\n` +
          `🌐 https://temp-mail.org | 🤖 @TempMail_org_bot\n\n` +
          `👋 Bienvenue sur TempMail Pro Bot!\n\n` +
          `Je peux vous aider à gérer vos emails temporaires.\n\n` +
          `📧 Utilisez "Génère nouvel email" pour créer un email\n` +
          `📬 Utilisez "Inbox" pour voir vos messages\n` +
          `👤 Utilisez "Compte" pour vous connecter ou créer un compte\n` +
          `⚙️ Utilisez "Paramètres" pour configurer le bot (domaine, langue…)`
        : `📧 <b>The Official TempMail Bot</b>\n` +
          `<i>From creators of the Legendary and Top#1 temporary email service</i>\n` +
          `🌐 https://temp-mail.org | 🤖 @TempMail_org_bot\n\n` +
          `👋 Welcome to TempMail Pro Bot!\n\n` +
          `I can help you manage your temporary emails.\n\n` +
          `📧 Use "Generate new email" to create an email\n` +
          `📬 Use "Inbox" to see your messages\n` +
          `👤 Use "Account" to log in or create an account\n` +
          `⚙️ Use "Settings" to configure the bot (domain, language…)`;

      await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...this.getMainKeyboard(lang, isLoggedIn) });
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
          `• Emails numérotés: username0@votre-domaine - username1000000@votre-domaine\n` +
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
          `• Numbered emails: username0@your-domain - username1000000@your-domain\n` +
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
      await this.manualRefresh(ctx);
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
          ? `📧 *Générer un nouvel email*\n\nEntrez l'adresse email que vous souhaitez créer.\n\n💡 Format: username@epmtyfl.me ou username123@epmtyfl.me`
          : `📧 *Generate new email*\n\nEnter the email address you want to create.\n\n💡 Format: username@epmtyfl.me or username123@epmtyfl.me`;
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
        ? '📧 Entrez l\'adresse email que vous souhaitez consulter:\n\nExemple: username@epmtyfl.me ou username123@epmtyfl.me' 
        : '📧 Enter the email address you want to check:\n\nExample: username@epmtyfl.me or username123@epmtyfl.me';
      
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

    // ── Domain selection ──────────────────────────────────────────────────
    this.bot.action('settings_choose_domain', async (ctx) => {
      if (!ctx.chat) return;
      await ctx.answerCbQuery();
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      const currentDomain = session?.preferredDomain || getAllDomains()[0];

      const header = lang === 'fr'
        ? `🌐 *Choisir le domaine de génération automatique*\n\nDomaine actuel: \`@${currentDomain}\`\n\nChoisissez un domaine ci-dessous:`
        : `🌐 *Choose the auto-generation domain*\n\nCurrent domain: \`@${currentDomain}\`\n\nSelect a domain below:`;

      // Build one button per domain, 2 per row
      const allDomains = getAllDomains();
      const domainRows: ReturnType<typeof Markup.button.callback>[][] = [];
      for (let i = 0; i < allDomains.length; i += 2) {
        const row = [Markup.button.callback(`@${allDomains[i]}`, `set_domain_${allDomains[i]}`)];
        if (allDomains[i + 1]) row.push(Markup.button.callback(`@${allDomains[i + 1]}`, `set_domain_${allDomains[i + 1]}`));
        domainRows.push(row);
      }
      domainRows.push([Markup.button.callback(lang === 'fr' ? '⬅️ Retour' : '⬅️ Back', 'settings_open')]);

      await ctx.reply(header, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(domainRows) });
    });

    this.bot.action(/^set_domain_(.+)$/, async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      const domain = ctx.match[1];

      const allDomains = getAllDomains();
      if (!allDomains.includes(domain)) {
        await ctx.answerCbQuery(lang === 'fr' ? '❌ Domaine inconnu' : '❌ Unknown domain', { show_alert: true });
        return;
      }

      session.preferredDomain = domain;

      const msg = lang === 'fr'
        ? `✅ Domaine mis à jour: \`@${domain}\`\n\nLes prochains emails générés utiliseront ce domaine.`
        : `✅ Domain updated: \`@${domain}\`\n\nNext generated emails will use this domain.`;

      await ctx.answerCbQuery(lang === 'fr' ? `✅ @${domain} sélectionné` : `✅ @${domain} selected`);
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      await this.showSettings(ctx);
    });

    this.bot.action('settings_open', async (ctx) => {
      if (!ctx.chat) return;
      await ctx.answerCbQuery();
      await this.showSettings(ctx);
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

    this.bot.action('switch_to_account_inbox', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      if (!session?.userId) {
        await ctx.answerCbQuery(
          lang === 'fr' ? '❌ Connectez-vous pour accéder à vos emails' : '❌ Log in to access your emails',
          { show_alert: true }
        );
        return;
      }
      
      delete session.currentEmail;
      
      await ctx.answerCbQuery(
        lang === 'fr' ? '📬 Basculement vers vos emails' : '📬 Switching to your emails'
      );
      
      await this.showInbox(ctx);
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
      if (!ctx.chat || !ctx.callbackQuery?.message) return;
      
      const session = this.sessions.get(ctx.chat.id);
      session.automationDebugMode = !session.automationDebugMode;
      const lang = session?.language || 'fr';
      const debugMode = session.automationDebugMode;
      
      const msg = session.automationDebugMode
        ? (lang === 'fr' ? '🔍 Mode debug activé' : '🔍 Debug mode enabled')
        : (lang === 'fr' ? '✨ Mode normal activé' : '✨ Normal mode enabled');
      
      await ctx.answerCbQuery(msg);
      
      const automationMsg = lang === 'fr'
        ? `🤖 *Automatisation de Comptes*\n\n` +
          `Créez automatiquement des comptes avec Playwright.\n\n` +
          `*Providers disponibles:*\n` +
          `• Replit\n\n` +
          `*Mode actuel:* ${debugMode ? '🔍 Debug (logs complets)' : '✨ Normal (étapes uniquement)'}\n\n` +
          `Sélectionnez un provider pour commencer:`
        : `🤖 *Account Automation*\n\n` +
          `Automatically create accounts with Playwright.\n\n` +
          `*Available providers:*\n` +
          `• Replit\n\n` +
          `*Current mode:* ${debugMode ? '🔍 Debug (full logs)' : '✨ Normal (steps only)'}\n\n` +
          `Select a provider to start:`;
      
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.callbackQuery.message.message_id,
          undefined,
          automationMsg,
          {
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
          }
        );
      } catch (error) {
        console.error('❌ [TELEGRAM] Error editing automation message:', error);
      }
    });

    this.bot.action('automation_replit_single', async (ctx) => {
      if (!ctx.chat) return;
      
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      await ctx.answerCbQuery();
      
      let email: string;
      if (session?.userId && session?.username) {
        const randomNum = Math.floor(Math.random() * 1000000);
        const autoDomain = session.preferredDomain || getAllDomains()[0];
        email = `${session.username}${randomNum}@${autoDomain}`;
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
            const getControlButtons = () => {
              if (task.status === 'completed' || task.status === 'failed' || task.status === 'stopped') {
                return [];
              }
              
              if (task.status === 'paused') {
                return [
                  [
                    Markup.button.callback(lang === 'fr' ? '▶️ Reprendre' : '▶️ Resume', `automation_resume_${taskId}`),
                    Markup.button.callback(lang === 'fr' ? '🛑 Arrêter' : '🛑 Stop', `automation_stop_${taskId}`)
                  ]
                ];
              }
              
              return [
                [
                  Markup.button.callback(lang === 'fr' ? '⏸️ Pause' : '⏸️ Pause', `automation_pause_${taskId}`),
                  Markup.button.callback(lang === 'fr' ? '🛑 Arrêter' : '🛑 Stop', `automation_stop_${taskId}`)
                ]
              ];
            };
            
            if (debugMode) {
              const newLogs = task.debugLogs.filter((log: string) => !sentLogs.has(log));
              for (const log of newLogs) {
                sentLogs.add(log);
              }
              
              if (newLogs.length > 0) {
                const logsText = lang === 'fr'
                  ? `🤖 *Automatisation Replit* (Debug)\n\n📧 Email: ${task.email}\n\n━━━━━━━━━━━━━━━\n\n${newLogs.join('\n')}`
                  : `🤖 *Replit Automation* (Debug)\n\n📧 Email: ${task.email}\n\n━━━━━━━━━━━━━━━\n\n${newLogs.join('\n')}`;
                
                try {
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    statusMessage.message_id,
                    undefined,
                    logsText,
                    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(getControlButtons()) }
                  );
                } catch (editError) {
                  
                }
              }

            for (const screenshot of task.screenshots) {
              const screenshotData = typeof screenshot === 'string' ? 
                { image: screenshot, description: '', attemptNumber: 1, error: null } : screenshot;
              
              const hash = screenshotData.image.substring(0, 100);
              if (!sentScreenshotHashes.has(hash)) {
                sentScreenshotHashes.add(hash);
                try {
                  const base64Data = screenshotData.image.replace(/^data:image\/png;base64,/, '');
                  const buffer = Buffer.from(base64Data, 'base64');
                  const screenshotNum = sentScreenshotHashes.size;
                  
                  let caption = lang === 'fr' 
                    ? `📸 Tentative ${screenshotData.attemptNumber}/3 - Capture ${screenshotNum}` 
                    : `📸 Attempt ${screenshotData.attemptNumber}/3 - Screenshot ${screenshotNum}`;
                  
                  if (screenshotData.description) {
                    caption += `\n${screenshotData.description}`;
                  }
                  
                  if (screenshotData.error) {
                    caption += lang === 'fr' ? `\n\n❌ Erreur: ${screenshotData.error}` : `\n\n❌ Error: ${screenshotData.error}`;
                  }
                  
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
                  { parse_mode: 'Markdown', ...Markup.inlineKeyboard(getControlButtons()) }
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

    this.bot.action(/automation_pause_(.+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const taskId = ctx.match[1];
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      accountAutomationService.pauseTask(taskId);
      
      await ctx.answerCbQuery(
        lang === 'fr' ? '⏸️ Automatisation mise en pause' : '⏸️ Automation paused'
      );
    });

    this.bot.action(/automation_resume_(.+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const taskId = ctx.match[1];
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      accountAutomationService.resumeTask(taskId);
      
      await ctx.answerCbQuery(
        lang === 'fr' ? '▶️ Automatisation reprise' : '▶️ Automation resumed'
      );
    });

    this.bot.action(/automation_stop_(.+)/, async (ctx) => {
      if (!ctx.chat) return;
      
      const taskId = ctx.match[1];
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      
      accountAutomationService.stopTask(taskId);
      
      await ctx.answerCbQuery(
        lang === 'fr' ? '🛑 Automatisation arrêtée' : '🛑 Automation stopped'
      );
    });

    this.bot.action('series_generate', async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      await ctx.answerCbQuery();

      const prefix = session.seriesPrefix || 'MYMAIL';
      const domain = session.seriesDomain || getAllDomains()[0];
      const counter = session.seriesCounter || 1;
      const padded = String(counter).padStart(3, '0');
      const email = `${prefix.toLowerCase()}${padded}@${domain}`;

      session.seriesCounter = counter + 1;
      session.currentEmail = email;
      session.lastCheckedMessages = new Map(); // reset tracking pour ce nouvel email

      const nextPadded = String(counter + 1).padStart(3, '0');
      const nextEmail = `${prefix.toLowerCase()}${nextPadded}@${domain}`;

      const msg = lang === 'fr'
        ? `📨 Email actif: \`${email}\`\n\n🔢 Prochain dans la série: \`${nextEmail}\`\n\n📬 *Chargement de l'inbox...*`
        : `📨 Active email: \`${email}\`\n\n🔢 Next in series: \`${nextEmail}\`\n\n📬 *Loading inbox...*`;

      await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'fr' ? '✉️ Générer suivant' : '✉️ Generate next', 'series_generate')],
        ])
      });

      // Ouvrir l'inbox automatiquement pour l'email généré
      await this.showInbox(ctx);
    });

    this.bot.action('series_config_prefix', async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      await ctx.answerCbQuery();
      
      session.awaitingSeriesPrefix = true;
      const currentPrefix = session.seriesPrefix || 'MYMAIL';
      const msg = lang === 'fr'
        ? `🔤 *Changer le préfixe*\n\nPréfixe actuel: \`${currentPrefix}\`\n\nEntrez le nouveau préfixe (lettres et chiffres uniquement):\n\nExemple: \`FERELKING\`, \`ZENRAY\`, \`MYBOT\``
        : `🔤 *Change prefix*\n\nCurrent prefix: \`${currentPrefix}\`\n\nEnter the new prefix (letters and numbers only):\n\nExample: \`FERELKING\`, \`ZENRAY\`, \`MYBOT\``;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    this.bot.action('series_config_domain', async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      await ctx.answerCbQuery();
      
      session.awaitingSeriesDomain = true;
      const currentDomain = session.seriesDomain || getAllDomains()[0];
      const msg = lang === 'fr'
        ? `🌐 *Changer le domaine*\n\nDomaine actuel: \`${currentDomain}\`\n\nEntrez le nouveau domaine:\n\nExemple: \`epmtyfl.me\`, \`gmail.com\`, \`proton.me\``
        : `🌐 *Change domain*\n\nCurrent domain: \`${currentDomain}\`\n\nEnter the new domain:\n\nExample: \`epmtyfl.me\`, \`gmail.com\`, \`proton.me\``;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    this.bot.action('series_config_start', async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      await ctx.answerCbQuery();
      
      session.awaitingSeriesStart = true;
      const msg = lang === 'fr'
        ? `🔢 *Changer le numéro de départ*\n\nCompteur actuel: \`${session.seriesCounter || 1}\`\n\nEntrez le numéro de départ (minimum 1):\n\nExemple: \`1\`, \`50\`, \`100\``
        : `🔢 *Change starting number*\n\nCurrent counter: \`${session.seriesCounter || 1}\`\n\nEnter the starting number (minimum 1):\n\nExample: \`1\`, \`50\`, \`100\``;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    this.bot.action('series_reset', async (ctx) => {
      if (!ctx.chat) return;
      const session = this.sessions.get(ctx.chat.id);
      const lang = session?.language || 'fr';
      await ctx.answerCbQuery();
      
      session.seriesCounter = 1;
      const prefix = session.seriesPrefix || 'MYMAIL';
      const domain = session.seriesDomain || getAllDomains()[0];
      const msg = lang === 'fr'
        ? `✅ Compteur remis à 1\n\nProchain email: \`${prefix.toLowerCase()}001@${domain}\``
        : `✅ Counter reset to 1\n\nNext email: \`${prefix.toLowerCase()}001@${domain}\``;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      await this.showEmailSeries(ctx);
    });

    this.bot.action('show_inbox', async (ctx) => {
      if (!ctx.chat) return;
      await ctx.answerCbQuery();
      await this.showInbox(ctx);
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

    console.log('🔄 [TELEGRAM] Starting auto-refresh every 2 seconds');
    
    this.autoRefreshInterval = setInterval(async () => {
      const activeSessions = Array.from(this.sessions.entries()).filter(
        ([_, session]) => session.currentEmail || session.userId
      );

      for (const [chatId, session] of activeSessions) {
        try {
          const emailToCheck = this.getActiveEmail(session);
          
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
              
              const fullMessage = await emailService.getMessageDetails(msg.id);
              if (!fullMessage) continue;
              
              const validationLinks = emailService.extractLinksFromMessage(fullMessage);
              const hasValidationLink = validationLinks.length > 0;
              
              console.log(`🔗 [TELEGRAM AUTO-REFRESH] Found ${validationLinks.length} validation links`);
              
              const textPreview = fullMessage.textContent 
                ? fullMessage.textContent.substring(0, 200).replace(/\s+/g, ' ').trim()
                : '';
              
              const richMessage = lang === 'fr'
                ? `👤 *De:* ${fullMessage.fromAddress}\n` +
                  `📝 *Sujet:* ${fullMessage.subject}\n\n` +
                  `${textPreview}${textPreview.length >= 200 ? '...' : ''}`
                : `👤 *From:* ${fullMessage.fromAddress}\n` +
                  `📝 *Subject:* ${fullMessage.subject}\n\n` +
                  `${textPreview}${textPreview.length >= 200 ? '...' : ''}`;
              
              if (hasValidationLink) {
                console.log(`🎯 [TELEGRAM AUTO-REFRESH] Lien de validation détecté pour message ${msg.id}`);
                
                const buttons1 = [
                  [
                    Markup.button.callback(
                      lang === 'fr' ? '📖 Voir message' : '📖 View message',
                      `view_message_${msg.id}`
                    ),
                    Markup.button.url(
                      lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                      validationLinks[0]
                    )
                  ],
                  [
                    Markup.button.callback(
                      lang === 'fr' ? '🔗 Lien détecté' : '🔗 Link detected',
                      `link_detected_${msg.id}`
                    )
                  ]
                ];
                
                const initialMessage = await this.bot.telegram.sendMessage(
                  chatId, 
                  richMessage,
                  { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons1) }
                );
                
                const bot = this.bot;
                setTimeout(async () => {
                  if (!bot) return;
                  
                  try {
                    const buttons2 = [
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '📖 Voir message' : '📖 View message',
                          `view_message_${msg.id}`
                        ),
                        Markup.button.url(
                          lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                          validationLinks[0]
                        )
                      ],
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '⏳ Validation...' : '⏳ Validating...',
                          `validating_${msg.id}`
                        )
                      ]
                    ];
                    
                    await bot.telegram.editMessageReplyMarkup(
                      chatId,
                      initialMessage.message_id,
                      undefined,
                      Markup.inlineKeyboard(buttons2).reply_markup!
                    );
                    
                    console.log(`🎯 [TELEGRAM AUTO-REFRESH] Démarrage de la validation pour message ${msg.id}`);
                    const { linkValidationService } = await import('../services/linkValidationService');
                    await linkValidationService.validateLinksInMessage(msg.id);
                    console.log(`✅ [TELEGRAM AUTO-REFRESH] Validation terminée pour message ${msg.id}`);
                    
                    const buttons3 = [
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '📖 Voir message' : '📖 View message',
                          `view_message_${msg.id}`
                        ),
                        Markup.button.url(
                          lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                          validationLinks[0]
                        )
                      ],
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '✅ Lien validé' : '✅ Link validated',
                          `validation_done_${msg.id}`
                        )
                      ]
                    ];
                    
                    await bot.telegram.editMessageReplyMarkup(
                      chatId,
                      initialMessage.message_id,
                      undefined,
                      Markup.inlineKeyboard(buttons3).reply_markup!
                    );
                  } catch (error) {
                    console.error(`❌ [TELEGRAM AUTO-REFRESH] Erreur de validation pour message ${msg.id}:`, error);
                    
                    const buttonsError = [
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '📖 Voir message' : '📖 View message',
                          `view_message_${msg.id}`
                        ),
                        Markup.button.url(
                          lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                          validationLinks[0]
                        )
                      ],
                      [
                        Markup.button.callback(
                          lang === 'fr' ? '❌ Erreur validation' : '❌ Validation error',
                          `validation_error_${msg.id}`
                        )
                      ]
                    ];
                    
                    await bot.telegram.editMessageReplyMarkup(
                      chatId,
                      initialMessage.message_id,
                      undefined,
                      Markup.inlineKeyboard(buttonsError).reply_markup!
                    );
                  }
                }, 500);
              } else {
                const buttons = [
                  [Markup.button.callback(
                    lang === 'fr' ? '📖 Voir le message' : '📖 View message',
                    `view_message_${msg.id}`
                  )]
                ];
                
                await this.bot.telegram.sendMessage(
                  chatId, 
                  richMessage,
                  { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
                );
              }
              
              session.lastMessageData = session.lastMessageData || new Map();
              session.lastMessageData.set(msg.id, fullMessage);
            }
            
            console.log(`✅ [TELEGRAM AUTO-REFRESH] Notified chat ${chatId} about ${newMessages.length} new message(s)`);
          }
        } catch (error) {
          console.error(`❌ [TELEGRAM AUTO-REFRESH] Error checking messages for chat ${chatId}:`, error);
        }
      }
    }, 2000);
  }

  private stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('🛑 [TELEGRAM] Auto-refresh stopped');
    }
  }

  /**
   * manualRefresh — appelé quand l'utilisateur appuie sur 🔄 manuellement.
   * Bypass le cache, montre TOUS les messages actuels (pas seulement les nouveaux).
   * Remet à zéro le tracker "vu" pour que l'auto-refresh reparte proprement.
   */
  private async manualRefresh(ctx: BotContext) {
    if (!ctx.chat) return;

    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    const emailToCheck = this.getActiveEmail(session);

    if (!emailToCheck) {
      const msg = lang === 'fr'
        ? '📧 Veuillez d\'abord générer un email.'
        : '📧 Please generate an email first.';
      await ctx.reply(msg);
      return;
    }

    // Bypass cache — on veut les vraies données fraîches
    const messages = await emailService.getMessages(emailToCheck, true);

    // Réinitialise le tracker "vu" → l'auto-refresh pourra re-notifier
    if (!session.lastCheckedMessages) session.lastCheckedMessages = new Map();
    session.lastCheckedMessages.set(emailToCheck, messages.map(m => m.id));

    if (messages.length === 0) {
      const msg = lang === 'fr'
        ? `📭 *Inbox: ${emailToCheck}*\n\nAucun message reçu.`
        : `📭 *Inbox: ${emailToCheck}*\n\nNo messages received.`;
      await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄', 'refresh')]])
      });
      return;
    }

    // Affiche tous les messages
    const now = new Date();
    const dateStr = now.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US');
    const timeStr = now.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US');

    const header = lang === 'fr'
      ? `📬 *Inbox: ${emailToCheck}*\n📊 ${messages.length} message(s)\n📅 ${dateStr} ${timeStr}\n━━━━━━━━━━━━━━━`
      : `📬 *Inbox: ${emailToCheck}*\n📊 ${messages.length} message(s)\n📅 ${dateStr} ${timeStr}\n━━━━━━━━━━━━━━━`;
    await ctx.reply(header, { parse_mode: 'Markdown' });

    for (const m of messages.slice(0, 5)) {
      const fullMessage = await emailService.getMessageDetails(m.id);
      const content = fullMessage?.textContent
        ? fullMessage.textContent.substring(0, 300).replace(/\s+/g, ' ').trim()
        : (fullMessage?.htmlContent
            ? fullMessage.htmlContent.replace(/<[^>]+>/g, '').substring(0, 300).trim()
            : '');
      const timeAgo = this.formatTimeAgo(m.createdAt, lang);
      const bodyLine = content ? `\n\n${content}${content.length >= 300 ? '…' : ''}` : '';

      const text = lang === 'fr'
        ? `📧 *De:* ${m.fromAddress}\n📝 *Sujet:* ${m.subject}\n🕐 ${timeAgo}${bodyLine}`
        : `📧 *From:* ${m.fromAddress}\n📝 *Subject:* ${m.subject}\n🕐 ${timeAgo}${bodyLine}`;

      const validationLinks = fullMessage ? emailService.extractLinksFromMessage(fullMessage) : [];

      const buttons = validationLinks.length > 0
        ? [[
            Markup.button.callback(lang === 'fr' ? '📖 Voir' : '📖 View', `view_message_${m.id}`),
            Markup.button.url(lang === 'fr' ? '🔗 Lien' : '🔗 Link', validationLinks[0])
          ]]
        : [[Markup.button.callback(lang === 'fr' ? '📖 Voir' : '📖 View', `view_message_${m.id}`)]];

      await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }

    if (messages.length > 5) {
      await ctx.reply(
        lang === 'fr' ? `… et ${messages.length - 5} autre(s) message(s).` : `… and ${messages.length - 5} more message(s).`
      );
    }
  }

  private async refreshAndNotifyNewMessages(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    const emailToCheck = this.getActiveEmail(session);
    
    if (!emailToCheck) {
      const msg = lang === 'fr' 
        ? '📧 Veuillez d\'abord générer un email ou vous connecter.' 
        : '📧 Please generate an email or log in first.';
      await ctx.reply(msg);
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
        const fullMessage = await emailService.getMessageDetails(msg.id);
        if (!fullMessage) continue;
        
        const validationLinks = emailService.extractLinksFromMessage(fullMessage);
        const hasValidationLink = validationLinks.length > 0;
        
        const textPreview = fullMessage.textContent 
          ? fullMessage.textContent.substring(0, 200).replace(/\s+/g, ' ').trim()
          : '';
        
        const richMessage = lang === 'fr'
          ? `📬 *Nouveau message*\n\n` +
            `👤 *De:* ${fullMessage.fromAddress}\n` +
            `📝 *Sujet:* ${fullMessage.subject}\n\n` +
            `${textPreview}${textPreview.length >= 200 ? '...' : ''}`
          : `📬 *New message*\n\n` +
            `👤 *From:* ${fullMessage.fromAddress}\n` +
            `📝 *Subject:* ${fullMessage.subject}\n\n` +
            `${textPreview}${textPreview.length >= 200 ? '...' : ''}`;
        
        if (hasValidationLink) {
          const buttons1 = [
            [
              Markup.button.callback(
                lang === 'fr' ? '📖 Voir message' : '📖 View message',
                `view_message_${msg.id}`
              ),
              Markup.button.url(
                lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                validationLinks[0]
              )
            ],
            [
              Markup.button.callback(
                lang === 'fr' ? '🔗 Lien détecté' : '🔗 Link detected',
                `link_detected_${msg.id}`
              )
            ]
          ];
          
          const initialMessage = await ctx.reply(richMessage, {
            parse_mode: 'Markdown', 
            ...Markup.inlineKeyboard(buttons1)
          });
          
          setTimeout(async () => {
            if (!this.bot || !ctx.chat) return;
            
            try {
              const buttons2 = [
                [
                  Markup.button.callback(
                    lang === 'fr' ? '📖 Voir message' : '📖 View message',
                    `view_message_${msg.id}`
                  ),
                  Markup.button.url(
                    lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                    validationLinks[0]
                  )
                ],
                [
                  Markup.button.callback(
                    lang === 'fr' ? '⏳ Validation...' : '⏳ Validating...',
                    `validating_${msg.id}`
                  )
                ]
              ];
              
              await this.bot.telegram.editMessageReplyMarkup(
                ctx.chat.id,
                initialMessage.message_id,
                undefined,
                Markup.inlineKeyboard(buttons2).reply_markup!
              );
              
              const { linkValidationService } = await import('../services/linkValidationService');
              await linkValidationService.validateLinksInMessage(msg.id);
              
              const buttons3 = [
                [
                  Markup.button.callback(
                    lang === 'fr' ? '📖 Voir message' : '📖 View message',
                    `view_message_${msg.id}`
                  ),
                  Markup.button.url(
                    lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                    validationLinks[0]
                  )
                ],
                [
                  Markup.button.callback(
                    lang === 'fr' ? '✅ Lien validé' : '✅ Link validated',
                    `validation_done_${msg.id}`
                  )
                ]
              ];
              
              await this.bot.telegram.editMessageReplyMarkup(
                ctx.chat.id,
                initialMessage.message_id,
                undefined,
                Markup.inlineKeyboard(buttons3).reply_markup!
              );
            } catch (error) {
              console.error(`❌ [TELEGRAM REFRESH] Erreur de validation:`, error);
            }
          }, 500);
        } else {
          const buttons = [
            [Markup.button.callback(
              lang === 'fr' ? '📖 Voir le message' : '📖 View message',
              `view_message_${msg.id}`
            )]
          ];
          
          await ctx.reply(richMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        }
        
        session.lastMessageData = session.lastMessageData || new Map();
        session.lastMessageData.set(msg.id, fullMessage);
      }
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
        ? '📬 *Inbox*\n\nPour voir votre inbox, entrez une adresse email.\n\nExemple: username@epmtyfl.me ou username123@epmtyfl.me' 
        : '📬 *Inbox*\n\nTo view your inbox, enter an email address.\n\nExample: username@epmtyfl.me or username123@epmtyfl.me';
      
      session.awaitingEmailAddress = true;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      return;
    }

    if (session.currentEmail) {
      const email = session.currentEmail;
      const messages = await emailService.getMessages(email);

      const accountInfo = session.userId 
        ? (lang === 'fr' 
          ? `\n🔑 Connecté: ${session.username}\n📧 Vous pouvez aussi utiliser: ${session.username}@epmtyfl.me`
          : `\n🔑 Logged in: ${session.username}\n📧 You can also use: ${session.username}@epmtyfl.me`)
        : (lang === 'fr' 
          ? `\n💡 Connectez-vous pour gérer plusieurs emails simultanément`
          : `\n💡 Log in to manage multiple emails simultaneously`);

      const msg = lang === 'fr'
        ? `📬 Inbox: ${email}\n\n` +
          `📊 Messages: ${messages.length}` +
          accountInfo
        : `📬 Inbox: ${email}\n\n` +
          `📊 Messages: ${messages.length}` +
          accountInfo;

      const keyboard = [];
      
      if (messages.length > 0) {
        keyboard.push([
          Markup.button.callback(
            lang === 'fr' ? '📧 Voir les messages' : '📧 View messages', 
            'view_guest_messages'
          )
        ]);
      }

      const row = [];
      row.push(Markup.button.callback(lang === 'fr' ? '📧 Autre Email' : '📧 Other Email', 'change_email'));
      row.push(Markup.button.callback('🔄', 'refresh'));
      
      if (session.userId) {
        row.push(Markup.button.callback(
          lang === 'fr' ? '📬 Mes emails' : '📬 My emails', 
          'switch_to_account_inbox'
        ));
      }
      
      keyboard.push(row);

      await ctx.reply(msg, Markup.inlineKeyboard(keyboard));
    } else if (session.userId) {
      const username = session.username;
      const domain = session.preferredDomain || getAllDomains()[0];
      
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
    }
  }

  private async showEmailDetails(ctx: BotContext, number?: number) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    let email: string;
    if (session.userId && number !== undefined) {
      const username = session.username;
      const domain = session.preferredDomain || getAllDomains()[0];
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
      ? `📬 *Inbox: ${email}*\n\n📊 Total: ${messages.length} message(s)\n📅 ${date}, ${time}\n\n━━━━━━━━━━━━━━━`
      : `📬 *Inbox: ${email}*\n\n📊 Total: ${messages.length} message(s)\n📅 ${date}, ${time}\n\n━━━━━━━━━━━━━━━`;

    await ctx.reply(headerMsg, { parse_mode: 'Markdown' });

    for (const m of messages.slice(0, 1)) {
      const fullMessage = await emailService.getMessageDetails(m.id);
      if (!fullMessage) continue;
      
      const timeAgo = this.formatTimeAgo(m.createdAt, lang);
      const textPreview = fullMessage.textContent 
        ? fullMessage.textContent.substring(0, 200).replace(/\s+/g, ' ').trim()
        : '';
      
      const richMessage = lang === 'fr'
        ? `📧 *De:* ${m.fromAddress}\n📝 *Sujet:* ${m.subject}\n🕐 ${timeAgo}\n\n${textPreview}${textPreview.length >= 200 ? '...' : ''}`
        : `📧 *From:* ${m.fromAddress}\n📝 *Subject:* ${m.subject}\n🕐 ${timeAgo}\n\n${textPreview}${textPreview.length >= 200 ? '...' : ''}`;
      
      const validationLinks = emailService.extractLinksFromMessage(fullMessage);
      const replitVerificationLinks = validationLinks.filter(link => 
        (link.includes('replit.com') || link.includes('repl.it')) && 
        link.includes('action-code') && 
        link.includes('mode=verifyEmail')
      );
      
      if (replitVerificationLinks.length > 0) {
        const buttons1 = [
          [
            Markup.button.callback(
              lang === 'fr' ? '📖 Voir message complet' : '📖 View full message',
              `view_message_${m.id}`
            ),
            Markup.button.url(
              lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
              replitVerificationLinks[0]
            )
          ],
          [
            Markup.button.callback(
              lang === 'fr' ? '🔗 Lien détecté' : '🔗 Link detected',
              `link_detected_${m.id}`
            )
          ]
        ];
        
        const initialMessage = await ctx.reply(richMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons1)
        });
        
        setTimeout(async () => {
          if (!this.bot || !ctx.chat) return;
          
          try {
            const buttons2 = [
              [
                Markup.button.callback(
                  lang === 'fr' ? '📖 Voir message complet' : '📖 View full message',
                  `view_message_${m.id}`
                ),
                Markup.button.url(
                  lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                  replitVerificationLinks[0]
                )
              ],
              [
                Markup.button.callback(
                  lang === 'fr' ? '⏳ Validation...' : '⏳ Validating...',
                  `validating_${m.id}`
                )
              ]
            ];
            
            await this.bot.telegram.editMessageReplyMarkup(
              ctx.chat.id,
              initialMessage.message_id,
              undefined,
              Markup.inlineKeyboard(buttons2).reply_markup!
            );
            
            const { linkValidationService } = await import('../services/linkValidationService');
            await linkValidationService.validateLinksInMessage(m.id);
            
            const buttons3 = [
              [
                Markup.button.callback(
                  lang === 'fr' ? '📖 Voir message complet' : '📖 View full message',
                  `view_message_${m.id}`
                ),
                Markup.button.url(
                  lang === 'fr' ? '🔗 Ouvrir lien' : '🔗 Open link',
                  replitVerificationLinks[0]
                )
              ],
              [
                Markup.button.callback(
                  lang === 'fr' ? '✅ Lien validé' : '✅ Link validated',
                  `validation_done_${m.id}`
                )
              ]
            ];
            
            await this.bot.telegram.editMessageReplyMarkup(
              ctx.chat.id,
              initialMessage.message_id,
              undefined,
              Markup.inlineKeyboard(buttons3).reply_markup!
            );
          } catch (error) {
            console.error('❌ [TELEGRAM] Auto-validation error:', error);
          }
        }, 500);
      } else {
        const buttons = [
          [Markup.button.callback(
            lang === 'fr' ? '📖 Voir message complet' : '📖 View full message',
            `view_message_${m.id}`
          )]
        ];
        
        await ctx.reply(richMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      }
      
      session.lastMessageData = session.lastMessageData || new Map();
      session.lastMessageData.set(m.id, fullMessage);
    }

    if (messages.length > 1) {
      const remainingMsg = lang === 'fr' 
        ? `\n━━━━━━━━━━━━━━━\n📊 ${messages.length - 1} autre(s) message(s) disponible(s)` 
        : `\n━━━━━━━━━━━━━━━\n📊 ${messages.length - 1} more message(s) available`;
      
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
      [lang === 'fr' ? '📨 Série mails' : '📨 Mail series', lang === 'fr' ? '🔄 Rafraîchir' : '🔄 Refresh'],
      [lang === 'fr' ? '👤 Compte' : '👤 Account', lang === 'fr' ? '⚙️ Paramètres' : '⚙️ Settings'],
      [lang === 'fr' ? '🤖 Automatisation' : '🤖 Automation'],
    ]).resize().persistent();
  }

  private generateRandomEmailAddress(domain?: string): string {
    const heroes = [
      'godfrost', 'flashnova', 'ironwolf', 'neostar', 'darkpeak',
      'voidcore', 'stormrex', 'frostbolt', 'rayden', 'jadewolf',
      'ashrock', 'novadawn', 'echoflame', 'apexcrow', 'fluxhawk',
      'bytestorm', 'zenwave', 'boldfire', 'ghostfox', 'titansky',
      'cyberblaze', 'driftwood', 'prismlight', 'arcforge', 'nexusx',
      'solarwind', 'lunarfox', 'crystaln', 'oxidecore', 'zenithx'
    ];
    const hero = heroes[Math.floor(Math.random() * heroes.length)];
    const num = Math.floor(Math.random() * 9000) + 1000; // always 4 digits
    const selectedDomain = domain || getAllDomains()[0];
    return `${hero}${num}@${selectedDomain}`;
  }

  private async generateRandomEmail(ctx: BotContext) {
    if (!ctx.chat) return;
    
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';
    
    // Use session-preferred domain for auto-generation
    const preferredDomain = session?.preferredDomain || getAllDomains()[0];
    const email = this.generateRandomEmailAddress(preferredDomain);
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
        `📬 Email principal: ${user.username}@epmtyfl.me\n` +
        `📅 Membre depuis: ${createdDate}\n\n` +
        `✨ Emails disponibles:\n` +
        `• ${user.username}@epmtyfl.me\n` +
        `• ${user.username}0@epmtyfl.me\n` +
        `• ${user.username}1@epmtyfl.me\n` +
        `• ... ${user.username}1000000@epmtyfl.me`
      : `👤 *Your Profile*\n\n` +
        `📧 Email: ${user.email}\n` +
        `👤 Username: ${user.username}\n` +
        `📬 Main email: ${user.username}@epmtyfl.me\n` +
        `📅 Member since: ${createdDate}\n\n` +
        `✨ Available emails:\n` +
        `• ${user.username}@epmtyfl.me\n` +
        `• ${user.username}0@epmtyfl.me\n` +
        `• ${user.username}1@epmtyfl.me\n` +
        `• ... ${user.username}1000000@epmtyfl.me`;

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
            `┃⛤┃📬 Email Principal: ${user.username}@epmtyfl.me\n` +
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
            `┃⛤┃📬 Main Email: ${user.username}@epmtyfl.me\n` +
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

    let autoValidation = true; // Activé par défaut
    let isLoggedIn = false;
    
    if (session?.userId) {
      isLoggedIn = true;
      const user = await storage.getUserById(session.userId);
      // Si l'utilisateur existe mais que autoValidateInbox est undefined/null, on met true par défaut
      autoValidation = user?.autoValidateInbox ?? true;
    }

    const loginStatus = isLoggedIn
      ? (lang === 'fr' ? '🟢 Connecté' : '🟢 Logged in')
      : (lang === 'fr' ? '🔴 Non connecté' : '🔴 Not logged in');

    const currentDomain = session?.preferredDomain || getAllDomains()[0];

    const settingsMsg = lang === 'fr'
      ? `🌹⃝━❮ Paramètres ❯━\n` +
        `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
        `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
        `⊹ ☪︎⋆ Configuration ⚙️\n` +
        `✧\n\n` +
        `┏━❮ Options ❯━\n` +
        `┃⛤┃👤 Statut: ${loginStatus}\n` +
        `┃⛤┃🌍 Langue: ${session.language === 'fr' ? 'Français 🇫🇷' : 'English 🇬🇧'}\n` +
        `┃⛤┃🌐 Domaine: @${currentDomain}\n` +
        (isLoggedIn ? `┃⛤┃✅ Auto-validation: ${autoValidation ? 'Activée ✅' : 'Désactivée ❌'}\n` : '') +
        `┃⛤┃🔔 Notifications: Actives\n` +
        `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
        `╰──────────────\n\n` +
        (!isLoggedIn ? `⚠️ Connectez-vous pour accéder à l'auto-validation` : '')
      : `🌹⃝━❮ Settings ❯━\n` +
        `┊ ┊ ┊ ┊ ┊ ⋆｡ ❀⋆｡ ☪︎⋆\n` +
        `┊ ┊ ✫ ˚♡ ⋆｡ ✧\n` +
        `⊹ ☪︎⋆ Configuration ⚙️\n` +
        `✧\n\n` +
        `┏━❮ Options ❯━\n` +
        `┃⛤┃👤 Status: ${loginStatus}\n` +
        `┃⛤┃🌍 Language: ${session.language === 'fr' ? 'Français 🇫🇷' : 'English 🇬🇧'}\n` +
        `┃⛤┃🌐 Domain: @${currentDomain}\n` +
        (isLoggedIn ? `┃⛤┃✅ Auto-validation: ${autoValidation ? 'Enabled ✅' : 'Disabled ❌'}\n` : '') +
        `┃⛤┃🔔 Notifications: Active\n` +
        `┃⛤┗━━━━━━━━━𖣔𖣔\n` +
        `╰──────────────\n\n` +
        (!isLoggedIn ? `⚠️ Log in to access auto-validation` : '');

    const buttons = [
      [Markup.button.callback(
        lang === 'fr' ? '🌍 Changer la langue' : '🌍 Change language',
        'settings_language'
      )],
      [Markup.button.callback(
        lang === 'fr' ? `🌐 Domaine: @${currentDomain}` : `🌐 Domain: @${currentDomain}`,
        'settings_choose_domain'
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
    } else {
      // Si pas connecté, afficher un bouton pour se connecter
      buttons.push([Markup.button.callback(
        lang === 'fr' ? '🔑 Se connecter' : '🔑 Log in',
        'account_login'
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

  private async showEmailSeries(ctx: BotContext) {
    if (!ctx.chat) return;
    const session = this.sessions.get(ctx.chat.id);
    const lang = session?.language || 'fr';

    const prefix = session.seriesPrefix || 'MYMAIL';
    const domain = session.seriesDomain || getAllDomains()[0];
    const counter = session.seriesCounter || 1;
    const padded = String(counter).padStart(3, '0');
    const nextEmail = `${prefix.toLowerCase()}${padded}@${domain}`;

    const msg = lang === 'fr'
      ? `📨 *Série d'emails*\n\n` +
        `🔤 Préfixe: \`${prefix}\`\n` +
        `🌐 Domaine: \`${domain}\`\n` +
        `🔢 Compteur: *${counter}* (prochain: \`${padded}\`)\n\n` +
        `📧 Prochain email: \`${nextEmail}\`\n\n` +
        `Appuyez sur *Générer* pour créer le prochain email de la série.`
      : `📨 *Mail Series*\n\n` +
        `🔤 Prefix: \`${prefix}\`\n` +
        `🌐 Domain: \`${domain}\`\n` +
        `🔢 Counter: *${counter}* (next: \`${padded}\`)\n\n` +
        `📧 Next email: \`${nextEmail}\`\n\n` +
        `Press *Generate* to create the next email in the series.`;

    const buttons = [
      [Markup.button.callback(lang === 'fr' ? '✉️ Générer prochain' : '✉️ Generate next', 'series_generate')],
      [
        Markup.button.callback(lang === 'fr' ? '🔤 Changer préfixe' : '🔤 Change prefix', 'series_config_prefix'),
        Markup.button.callback(lang === 'fr' ? '🌐 Changer domaine' : '🌐 Change domain', 'series_config_domain'),
      ],
      [
        Markup.button.callback(lang === 'fr' ? '🔢 Changer départ' : '🔢 Change start', 'series_config_start'),
        Markup.button.callback(lang === 'fr' ? '🔄 Reset compteur' : '🔄 Reset counter', 'series_reset'),
      ],
      [Markup.button.callback(lang === 'fr' ? '❌ Fermer' : '❌ Close', 'close_menu')],
    ];

    await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
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
        `• Replit\n\n` +
        `*Mode actuel:* ${debugMode ? '🔍 Debug (logs complets)' : '✨ Normal (étapes uniquement)'}\n\n` +
        `Sélectionnez un provider pour commencer:`
      : `🤖 *Account Automation*\n\n` +
        `Automatically create accounts with Playwright.\n\n` +
        `*Available providers:*\n` +
        `• Replit\n\n` +
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
          ? '📁 Entrez l\'adresse email que vous souhaitez charger:\n\nExemple: username@epmtyfl.me ou username123@epmtyfl.me' 
          : '📁 Enter the email address you want to load:\n\nExample: username@epmtyfl.me or username123@epmtyfl.me';
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

      if (text === '📨 Série mails' || text === '📨 Mail series') {
        await this.showEmailSeries(ctx);
        return;
      }

      if (session.awaitingSeriesPrefix) {
        const trimmed = text.trim().toUpperCase();
        if (!/^[A-Z0-9]{2,20}$/.test(trimmed)) {
          await ctx.reply(lang === 'fr'
            ? '❌ Préfixe invalide. Utilisez uniquement des lettres et chiffres (2-20 caractères).\n\nExemple: `FERELKING`'
            : '❌ Invalid prefix. Use only letters and numbers (2-20 chars).\n\nExample: `FERELKING`',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        delete session.awaitingSeriesPrefix;
        session.seriesPrefix = trimmed;
        const domain = session.seriesDomain || getAllDomains()[0];
        const counter = session.seriesCounter || 1;
        const padded = String(counter).padStart(3, '0');
        await ctx.reply(
          lang === 'fr'
            ? `✅ Préfixe mis à jour: \`${trimmed}\`\n\nProchain email: \`${trimmed.toLowerCase()}${padded}@${domain}\``
            : `✅ Prefix updated: \`${trimmed}\`\n\nNext email: \`${trimmed.toLowerCase()}${padded}@${domain}\``,
          { parse_mode: 'Markdown' }
        );
        await this.showEmailSeries(ctx);
        return;
      }

      if (session.awaitingSeriesDomain) {
        const trimmed = text.trim().toLowerCase();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) {
          await ctx.reply(lang === 'fr'
            ? '❌ Domaine invalide.\n\nExemple: `epmtyfl.me`, `gmail.com`'
            : '❌ Invalid domain.\n\nExample: `epmtyfl.me`, `gmail.com`',
            { parse_mode: 'Markdown' }
          );
          return;
        }
        delete session.awaitingSeriesDomain;
        session.seriesDomain = trimmed;
        const prefix = session.seriesPrefix || 'MYMAIL';
        const counter = session.seriesCounter || 1;
        const padded = String(counter).padStart(3, '0');
        await ctx.reply(
          lang === 'fr'
            ? `✅ Domaine mis à jour: \`${trimmed}\`\n\nProchain email: \`${prefix.toLowerCase()}${padded}@${trimmed}\``
            : `✅ Domain updated: \`${trimmed}\`\n\nNext email: \`${prefix.toLowerCase()}${padded}@${trimmed}\``,
          { parse_mode: 'Markdown' }
        );
        await this.showEmailSeries(ctx);
        return;
      }

      if (session.awaitingSeriesStart) {
        const num = parseInt(text.trim());
        if (isNaN(num) || num < 1 || num > 9999) {
          await ctx.reply(lang === 'fr'
            ? '❌ Numéro invalide. Entrez un nombre entre 1 et 9999.'
            : '❌ Invalid number. Enter a number between 1 and 9999.'
          );
          return;
        }
        delete session.awaitingSeriesStart;
        session.seriesCounter = num;
        const prefix = session.seriesPrefix || 'MYMAIL';
        const domain = session.seriesDomain || getAllDomains()[0];
        const padded = String(num).padStart(3, '0');
        await ctx.reply(
          lang === 'fr'
            ? `✅ Départ mis à jour: \`${num}\`\n\nProchain email: \`${prefix.toLowerCase()}${padded}@${domain}\``
            : `✅ Start updated: \`${num}\`\n\nNext email: \`${prefix.toLowerCase()}${padded}@${domain}\``,
          { parse_mode: 'Markdown' }
        );
        await this.showEmailSeries(ctx);
        return;
      }

      if (session.awaitingNewEmail) {
        // Accept any email with a supported domain
        const emailParts = text.split('@');
        const isValidEmail = emailParts.length === 2 &&
          /^[a-zA-Z0-9._-]+$/.test(emailParts[0]) &&
          getAllDomains().includes(emailParts[1]);
        if (!isValidEmail) {
          const domainList = getAllDomains().slice(0, 3).map(d => `@${d}`).join(', ');
          const msg = lang === 'fr' 
            ? `❌ Format invalide.\n\nUtilisez un domaine supporté: ${domainList}…\n\nExemple: monnom@epmtyfl.me` 
            : `❌ Invalid format.\n\nUse a supported domain: ${domainList}…\n\nExample: myname@epmtyfl.me`;
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
        // Accept any valid email (not just our domains, allow fetching any address)
        const emailParts = text.split('@');
        const isValidEmail = emailParts.length === 2 &&
          /^[a-zA-Z0-9._-]+$/.test(emailParts[0]) &&
          emailParts[1].includes('.');
        if (!isValidEmail) {
          const msg = lang === 'fr' 
            ? '❌ Format invalide.\n\nEntrez une adresse email valide.\n\nExemple: monnom@epmtyfl.me' 
            : '❌ Invalid format.\n\nEnter a valid email address.\n\nExample: myname@epmtyfl.me';
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
          ? `${session.username}@epmtyfl.me` 
          : `${session.username}${number}@epmtyfl.me`;
        
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
            ? `🎉 Inscription réussie!\n\nBienvenue ${user.username}!\n\nVotre email principal: ${user.username}@epmtyfl.me` 
            : `🎉 Registration successful!\n\nWelcome ${user.username}!\n\nYour main email: ${user.username}@epmtyfl.me`;
          
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
