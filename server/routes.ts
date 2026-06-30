import type { Express } from "express";
import { createServer, type Server } from "http";
import { emailService } from "./services/emailService";
import { linkValidationService } from "./services/linkValidationService";
import { playwrightService } from "./services/playwrightService";
import { storage } from "./services/supabaseStorage";
import { sqlService } from "./services/sqlService";
import { accountAutomationService } from "./services/accountAutomationService";
import { z } from "zod";
import session from "express-session";

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Health check endpoint for keep-alive service
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        username: z.string()
          .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
          .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères")
          .regex(/^[a-zA-Z]+$/, "Le nom d'utilisateur ne peut contenir que des lettres (pas de chiffres)"),
        password: z.string().min(8),
      });

      const data = schema.parse(req.body);

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà" });
      }

      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris (insensible à la casse)" });
      }

      const user = await storage.createUser(data);
      req.session.userId = user.id;

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === 'ZodError') {
        const zodError = error as z.ZodError;
        const firstError = zodError.errors[0];
        return res.status(400).json({ error: firstError?.message || "Données invalides" });
      }
      res.status(500).json({ error: error.message || "Erreur lors de l'inscription" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string(),
      });

      const data = schema.parse(req.body);

      const user = await storage.verifyPassword(data.email, data.password);
      if (!user) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect" });
      }

      req.session.userId = user.id;

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Données invalides" });
      }
      res.status(500).json({ error: "Erreur lors de la connexion" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Erreur lors de la déconnexion" });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      autoValidateInbox: user.autoValidateInbox,
      createdAt: user.createdAt,
    });
  });

  app.put("/api/auth/settings", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const schema = z.object({
        autoValidateInbox: z.boolean(),
      });

      const data = schema.parse(req.body);
      const user = await storage.updateUserSettings(req.session.userId, data.autoValidateInbox);
      
      if (!user) {
        return res.status(500).json({ error: "Erreur lors de la mise à jour des paramètres" });
      }

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        autoValidateInbox: user.autoValidateInbox,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("Error updating settings:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Données invalides" });
      }
      res.status(500).json({ error: "Erreur lors de la mise à jour des paramètres" });
    }
  });

  // API Tokens routes
  app.get("/api/tokens", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const tokens = await storage.getApiTokensByUserId(req.session.userId);
      res.json(tokens);
    } catch (error: any) {
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des tokens" });
    }
  });

  app.post("/api/tokens", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const schema = z.object({
        name: z.string().min(1).max(50).optional(),
      });

      const data = schema.parse(req.body);
      const token = await storage.createApiToken(req.session.userId, data.name);
      res.json(token);
    } catch (error: any) {
      console.error("Error creating token:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Données invalides" });
      }
      res.status(500).json({ error: "Erreur lors de la création du token" });
    }
  });

  app.delete("/api/tokens/:id", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const { id } = req.params;
      const success = await storage.deleteApiToken(id, req.session.userId);
      
      if (!success) {
        return res.status(404).json({ error: "Token non trouvé" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting token:", error);
      res.status(500).json({ error: "Erreur lors de la suppression du token" });
    }
  });

  // Get messages for an email address
  app.get("/api/email/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const forceRefresh = req.query.force === 'true';
      console.log(`🌐 [ROUTE] GET /api/email/${email} - Starting... (force: ${forceRefresh})`);
      const messages = await emailService.getMessages(email, forceRefresh);
      console.log(`🌐 [ROUTE] GET /api/email/${email} - Completed with ${messages.length} messages`);
      res.json(messages);
    } catch (error) {
      console.error(`🌐 [ROUTE] GET /api/email/:email - Failed:`, error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get message details by inbox ID
  app.get("/api/inbox/:inboxId", async (req, res) => {
    try {
      const inboxId = req.params.inboxId;
      const message = await emailService.getMessageDetails(inboxId);
      
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      res.json(message);
    } catch (error) {
      console.error("Failed to fetch message details:", error);
      res.status(500).json({ error: "Failed to fetch message details" });
    }
  });

  // Delete a message
  app.delete("/api/message/:inboxId", async (req, res) => {
    try {
      const inboxId = req.params.inboxId;
      const success = await emailService.deleteMessage(inboxId);
      
      // Invalidate cache for all emails to ensure deleted messages don't reappear
      await emailService.invalidateAllCaches();
      
      res.json({ success });
    } catch (error) {
      console.error("Failed to delete message:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Validate links in a message
  app.post("/api/validate/:inboxId", async (req, res) => {
    try {
      const inboxId = req.params.inboxId;
      const validations = await linkValidationService.validateLinksInMessage(inboxId);
      res.json(validations);
    } catch (error) {
      console.error("Failed to validate links:", error);
      res.status(500).json({ error: "Failed to validate links" });
    }
  });

  // Get validation status
  app.get("/api/validation/:inboxId", async (req, res) => {
    try {
      const inboxId = req.params.inboxId;
      const validation = await linkValidationService.getValidationStatus(inboxId);
      res.json(validation);
    } catch (error) {
      console.error("Failed to get validation status:", error);
      res.status(500).json({ error: "Failed to get validation status" });
    }
  });

  // Test Playwright with any URL
  app.post("/api/test-playwright", async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().url()
      });
      
      const { url } = schema.parse(req.body);
      console.log(`\n🧪 [TEST] Testing Playwright with URL: ${url}\n`);
      
      const result = await playwrightService.validateLink(url);
      
      res.json({ 
        ...result,
        url,
        message: result.success ? 'Validation réussie! ✅' : 'Validation échouée - vérifiez les détails ci-dessous',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Failed to test Playwright:", error);
      res.status(500).json({ 
        error: "Failed to test Playwright", 
        details: error.message 
      });
    }
  });

  // Get email history (optionally filtered by user)
  app.get("/api/history", async (req, res) => {
    try {
      const userId = req.session.userId;
      const history = await storage.getEmailHistory(userId);
      res.json(history);
    } catch (error) {
      console.error("Failed to get email history:", error);
      res.status(500).json({ error: "Failed to get email history" });
    }
  });

  // Save email to history
  app.post("/api/history", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        messageCount: z.number().optional(),
      });

      const data = schema.parse(req.body);
      const userId = req.session.userId;
      
      await storage.saveEmailToHistory(data.email, userId, data.messageCount);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to save email to history:", error);
      res.status(500).json({ error: "Failed to save email to history" });
    }
  });

  // SQL execution routes (RPC method)
  app.post("/api/sql/execute", async (req, res) => {
    try {
      const schema = z.object({
        query: z.string(),
      });

      const { query } = schema.parse(req.body);
      const result = await sqlService.executeSql(query);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("SQL execution error:", error);
      res.status(500).json({ error: error.message || "Failed to execute SQL" });
    }
  });

  app.post("/api/sql/execute-multiple", async (req, res) => {
    try {
      const schema = z.object({
        queries: z.array(z.string()),
      });

      const { queries } = schema.parse(req.body);
      const results = await sqlService.executeMultipleSql(queries);
      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error("Multiple SQL execution error:", error);
      res.status(500).json({ error: error.message || "Failed to execute SQL queries" });
    }
  });

  app.get("/api/sql/tables", async (req, res) => {
    try {
      const tables = await sqlService.getTablesList();
      res.json({ success: true, tables });
    } catch (error: any) {
      console.error("Failed to get tables:", error);
      res.status(500).json({ error: error.message || "Failed to get tables list" });
    }
  });

  app.get("/api/sql/table-structure/:tableName", async (req, res) => {
    try {
      const { tableName } = req.params;
      const structure = await sqlService.getTableStructure(tableName);
      res.json({ success: true, structure });
    } catch (error: any) {
      console.error("Failed to get table structure:", error);
      res.status(500).json({ error: error.message || "Failed to get table structure" });
    }
  });

  // Get system status
  app.get("/api/status", async (req, res) => {
    try {
      const activeBrowsers = await linkValidationService.getActiveBrowserCount();
      res.json({ 
        activeBrowsers,
        maxBrowsers: 2,
        status: 'online' 
      });
    } catch (error) {
      console.error("Failed to get status:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // Account automation routes
  app.get("/api/automation/debug", async (req, res) => {
    try {
      const debugMode = accountAutomationService.getDebugMode();
      res.json({ debugMode });
    } catch (error: any) {
      console.error("Get debug mode error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la récupération du mode debug" });
    }
  });

  app.post("/api/automation/debug", async (req, res) => {
    try {
      const schema = z.object({
        enabled: z.boolean(),
      });

      const data = schema.parse(req.body);
      accountAutomationService.setDebugMode(data.enabled);
      
      res.json({ success: true, debugMode: data.enabled });
    } catch (error: any) {
      console.error("Debug mode error:", error);
      res.status(500).json({ error: error.message || "Erreur lors du changement de mode" });
    }
  });

  app.post("/api/automation/replit", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
      });

      const data = schema.parse(req.body);
      const result = await accountAutomationService.createReplitAccount(data.email);
      
      res.json(result);
    } catch (error: any) {
      console.error("Automation error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Email invalide" });
      }
      res.status(500).json({ error: error.message || "Erreur lors de l'automatisation" });
    }
  });

  app.get("/api/automation/task/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const task = accountAutomationService.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Tâche non trouvée" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Get task error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la récupération de la tâche" });
    }
  });

  app.get("/api/automation/tasks", async (req, res) => {
    try {
      const tasks = accountAutomationService.getAllTasks();
      res.json({ tasks });
    } catch (error: any) {
      console.error("Get tasks error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la récupération des tâches" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
