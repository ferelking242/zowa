import { useState, useEffect, useCallback } from "react";

export interface EmailHistoryEntry {
  email: string;
  createdAt: number;
  lastChecked: number;
  messageCount: number;
  hasValidatedLinks: boolean;
  validationStatus?: 'success' | 'failed' | 'pending';
}

const HISTORY_KEY = "tempmail_email_history";
const MAX_HISTORY = 50;

export function useEmailHistory() {
  const [history, setHistory] = useState<EmailHistoryEntry[]>([]);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error("Failed to parse email history:", error);
      }
    }
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: EmailHistoryEntry[]) => {
    const trimmedHistory = newHistory.slice(0, MAX_HISTORY);
    setHistory(trimmedHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmedHistory));
  }, []);

  // Add or update email in history
  const updateEmailHistory = useCallback((
    email: string,
    updates: Partial<Omit<EmailHistoryEntry, 'email'>>
  ) => {
    setHistory((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.email === email);
      
      if (existingIndex >= 0) {
        // Update existing entry
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...updates,
          lastChecked: Date.now(),
        };
        saveHistory(updated);
        return updated;
      } else {
        // Add new entry
        const newEntry: EmailHistoryEntry = {
          email,
          createdAt: Date.now(),
          lastChecked: Date.now(),
          messageCount: 0,
          hasValidatedLinks: false,
          ...updates,
        };
        const updated = [newEntry, ...prev];
        saveHistory(updated);
        return updated;
      }
    });
  }, [saveHistory]);

  // Remove email from history
  const removeEmailFromHistory = useCallback((email: string) => {
    setHistory((prev) => {
      const updated = prev.filter((entry) => entry.email !== email);
      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  // Get entry for specific email
  const getEmailEntry = useCallback((email: string) => {
    return history.find((entry) => entry.email === email);
  }, [history]);

  return {
    history,
    updateEmailHistory,
    removeEmailFromHistory,
    clearHistory,
    getEmailEntry,
  };
}
