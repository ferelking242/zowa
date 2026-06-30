import { useState, useEffect, useCallback } from "react";

export interface Settings {
  autoValidation: boolean;
  showNotifications: boolean;
  autoValidationDelay: number;
  notificationPosition: 'top-right' | 'bottom';
  swipeActions: {
    leftSwipe: 'archive' | 'delete' | 'none';
    rightSwipe: 'archive' | 'delete' | 'none';
  };
}

const DEFAULT_SETTINGS: Settings = {
  autoValidation: true,
  showNotifications: true,
  autoValidationDelay: 1000,
  notificationPosition: 'top-right',
  swipeActions: {
    leftSwipe: 'archive',
    rightSwipe: 'delete',
  },
};

const SETTINGS_KEY = "tempmail_settings";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error("Failed to parse settings:", error);
      }
    }
  }, []);

  // Save settings to localStorage
  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
