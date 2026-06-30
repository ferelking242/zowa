import { apiRequest } from "./queryClient";
import { type Message, type LinkValidation } from "@shared/schema";

export const api = {
  // Email operations
  getMessages: async (email: string, forceRefresh: boolean = false): Promise<Message[]> => {
    const url = forceRefresh ? `/api/email/${email}?force=true` : `/api/email/${email}`;
    const response = await apiRequest("GET", url);
    return response.json();
  },

  getMessageDetails: async (inboxId: string): Promise<Message> => {
    const response = await apiRequest("GET", `/api/inbox/${inboxId}`);
    return response.json();
  },

  deleteMessage: async (inboxId: string): Promise<{ success: boolean }> => {
    const response = await apiRequest("DELETE", `/api/message/${inboxId}`);
    return response.json();
  },

  // Link validation operations
  validateLinks: async (inboxId: string): Promise<LinkValidation[]> => {
    const response = await apiRequest("POST", `/api/validate/${inboxId}`);
    return response.json();
  },

  getValidationStatus: async (inboxId: string): Promise<LinkValidation | null> => {
    const response = await apiRequest("GET", `/api/validation/${inboxId}`);
    return response.json();
  },

  // System status
  getSystemStatus: async (): Promise<{ activeBrowsers: number; maxBrowsers: number; status: string }> => {
    const response = await apiRequest("GET", "/api/status");
    return response.json();
  },

  // Email history
  saveEmailToHistory: async (email: string, messageCount?: number): Promise<{ success: boolean }> => {
    const response = await apiRequest("POST", "/api/history", { email, messageCount });
    return response.json();
  },
};
