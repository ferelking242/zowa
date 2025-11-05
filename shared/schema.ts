import { z } from "zod";

export const tempEmailSchema = z.object({
  email: z.string().email(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export const messageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  textContent: z.string().nullable(),
  htmlContent: z.string().nullable(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export const linkValidationSchema = z.object({
  inboxId: z.string(),
  url: z.string().url(),
  status: z.enum(['pending', 'success', 'failed']),
  method: z.enum(['firebase', 'playwright']),
  validatedAt: z.number().optional(),
  linkType: z.object({
    provider: z.string(),
    type: z.enum(['verification', 'reset', 'confirmation', 'action', 'unknown']),
    icon: z.string(),
    color: z.string(),
  }).optional(),
});

export const insertLinkValidationSchema = linkValidationSchema.omit({
  status: true,
  validatedAt: true,
}).extend({
  linkType: z.object({
    provider: z.string(),
    type: z.enum(['verification', 'reset', 'confirmation', 'action', 'unknown']),
    icon: z.string(),
    color: z.string(),
  }).optional(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  passwordHash: z.string(),
  autoValidateInbox: z.boolean().optional().default(true),
  createdAt: z.number(),
});

export const apiTokenSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  name: z.string().optional(),
  createdAt: z.number(),
  lastUsedAt: z.number().optional(),
});

export const insertUserSchema = userSchema.omit({
  id: true,
  createdAt: true,
  autoValidateInbox: true,
});

export const insertApiTokenSchema = apiTokenSchema.omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export const emailBoxSchema = z.object({
  id: z.string(),
  prefix: z.string(),
  number: z.number(),
  domain: z.string(),
  fullEmail: z.string().email(),
  createdAt: z.number(),
  messageCount: z.number().default(0),
});

export const insertEmailBoxSchema = emailBoxSchema.omit({
  id: true,
  createdAt: true,
  messageCount: true,
});

export type TempEmail = z.infer<typeof tempEmailSchema>;
export type Message = z.infer<typeof messageSchema>;
export type LinkValidation = z.infer<typeof linkValidationSchema>;
export type InsertLinkValidation = z.infer<typeof insertLinkValidationSchema>;
export const automationStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
});

export const automationTaskSchema = z.object({
  id: z.string(),
  provider: z.enum(['replit', 'github', 'google', 'other']),
  email: z.string().email(),
  password: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  steps: z.array(automationStepSchema).default([]),
  screenshots: z.array(z.string()).default([]),
  logs: z.array(z.string()).default([]),
  debugLogs: z.array(z.string()).default([]),
  errorMessages: z.array(z.string()).default([]),
  createdAt: z.number(),
  completedAt: z.number().optional(),
});

export const insertAutomationTaskSchema = automationTaskSchema.omit({
  id: true,
  createdAt: true,
  completedAt: true,
  steps: true,
  screenshots: true,
  logs: true,
  debugLogs: true,
  errorMessages: true,
});

export const replitAccountSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  password: z.string(),
  verified: z.boolean().default(false),
  createdAt: z.number(),
  verifiedAt: z.number().optional(),
});

export const insertReplitAccountSchema = replitAccountSchema.omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
  verified: true,
});

export const cookieSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  createdAt: z.number(),
});

export const insertCookieSchema = cookieSchema.omit({
  id: true,
  createdAt: true,
});

export type User = z.infer<typeof userSchema>;
export type ApiToken = z.infer<typeof apiTokenSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type EmailBox = z.infer<typeof emailBoxSchema>;
export type InsertEmailBox = z.infer<typeof insertEmailBoxSchema>;
export type AutomationStep = z.infer<typeof automationStepSchema>;
export type AutomationTask = z.infer<typeof automationTaskSchema>;
export type InsertAutomationTask = z.infer<typeof insertAutomationTaskSchema>;
export type ReplitAccount = z.infer<typeof replitAccountSchema>;
export type InsertReplitAccount = z.infer<typeof insertReplitAccountSchema>;
export type Cookie = z.infer<typeof cookieSchema>;
export type InsertCookie = z.infer<typeof insertCookieSchema>;
