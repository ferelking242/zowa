import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { useEmailHistory } from "@/hooks/use-email-history";
import { type Message } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { BrowserNotificationService } from "@/lib/notifications";
import { getAllDomains } from "@shared/email-providers";

export function useEmail() {
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [pollingInterval, setPollingInterval] = useState<number>(5000);
  const [isPolling, setIsPolling] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loadTime, setLoadTime] = useState<number>(0);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { updateEmailHistory } = useEmailHistory();

  // Generate random email address with short, beautiful names
  const generateEmail = useCallback((domain?: string | any) => {
    // Ensure domain is always a string
    let selectedDomain = domain;
    if (typeof selectedDomain !== 'string' || !selectedDomain) {
      selectedDomain = localStorage.getItem('tempmail_selected_domain') || getAllDomains()[0];
    }
    const adjectives = ["cool", "fast", "blue", "red", "zen", "soft", "gold", "dark", "lite", "deep"];
    const nouns = ["cat", "dog", "fox", "owl", "bee", "ray", "sky", "sun", "moon", "star"];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 99);
    const email = `${randomAdj}${randomNoun}${randomNum}@${selectedDomain}`;
    setCurrentEmail(email);
    localStorage.setItem('tempmail_current_email', email);
    localStorage.setItem('tempmail_selected_domain', selectedDomain);
    updateEmailHistory(email, { messageCount: 0 });
    // Save to database history
    api.saveEmailToHistory(email, 0).catch(err => console.error('Failed to save email to history:', err));
    return email;
  }, [updateEmailHistory]);

  // Custom email - directly set without availability check
  const setCustomEmail = useCallback(async (username: string, domain?: string | any) => {
    // Ensure domain is always a string
    let selectedDomain = domain;
    if (typeof selectedDomain !== 'string' || !selectedDomain) {
      selectedDomain = localStorage.getItem('tempmail_selected_domain') || getAllDomains()[0];
    }
    const email = `${username}@${selectedDomain}`;
    
    // Directly set the email without checking availability
    setCurrentEmail(email);
    localStorage.setItem('tempmail_current_email', email);
    localStorage.setItem('tempmail_selected_domain', selectedDomain);
    updateEmailHistory(email, { messageCount: 0 });
    // Save to database history
    api.saveEmailToHistory(email, 0).catch(err => console.error('Failed to save email to history:', err));
    return { success: true, email };
  }, [updateEmailHistory]);

  // Initialize with email from localStorage or generate new one
  useEffect(() => {
    if (!currentEmail) {
      const savedEmail = localStorage.getItem('tempmail_current_email');
      if (savedEmail) {
        setCurrentEmail(savedEmail);
      } else {
        generateEmail();
      }
    }
  }, [currentEmail, generateEmail]);

  // Messages query with polling
  const {
    data: messages = [],
    isLoading,
    error,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["/api/email", currentEmail],
    queryFn: async () => {
      console.log(`🔄 [USE-EMAIL] Fetching messages for: ${currentEmail} (polling: ${isPolling})`);
      const result = await api.getMessages(currentEmail);
      console.log(`✅ [USE-EMAIL] Got ${result.length} messages`);
      setLastRefresh(new Date());
      
      // Update message count in history (both local and database)
      if (result.length > 0) {
        updateEmailHistory(currentEmail, { messageCount: result.length });
        api.saveEmailToHistory(currentEmail, result.length).catch(err => 
          console.error('Failed to update message count in history:', err)
        );
      }
      
      return result;
    },
    enabled: !!currentEmail,
    refetchInterval: isPolling ? pollingInterval : false,
    refetchIntervalInBackground: true,
  });

  // System status query
  const { data: systemStatus } = useQuery({
    queryKey: ["/api/status"],
    queryFn: api.getSystemStatus,
    refetchInterval: 10000, // Update every 10 seconds
  });

  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: api.deleteMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email", currentEmail] });
      toast.success(t('toast.messageDeleted'), {
        description: t('toast.messageDeletedDesc'),
      });
    },
    onError: () => {
      toast.error(t('toast.deleteFailed'), {
        description: t('toast.deleteFailedDesc'),
      });
    },
  });

  // Validate links mutation
  const validateLinksMutation = useMutation({
    mutationFn: api.validateLinks,
    onSuccess: (data, inboxId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/validation", inboxId] });
      toast.info(t('toast.linkValidationStarted'), {
        description: t('toast.linkValidationStartedDesc'),
        duration: 5000,
      });
    },
  });

  // Copy email to clipboard
  const copyEmail = useCallback(async () => {
    if (!currentEmail) return;

    try {
      await navigator.clipboard.writeText(currentEmail);
      toast.success(t('toast.emailCopied'), {
        description: t('toast.emailCopiedDesc'),
      });
    } catch (error) {
      toast.error(t('toast.copyFailed'), {
        description: t('toast.copyFailedDesc'),
      });
    }
  }, [currentEmail, t]);

  // Generate new email
  const generateNewEmail = useCallback((domain?: string) => {
    const newEmail = generateEmail(domain);
    queryClient.removeQueries({ queryKey: ["/api/email"] });
    localStorage.setItem('tempmail_current_email', newEmail);
    toast.success(t('toast.newEmailGenerated'), {
      description: t('toast.newEmailGeneratedDesc', { email: newEmail }),
    });
  }, [generateEmail, queryClient, t]);

  // Clear inbox
  const clearInbox = useCallback(async () => {
    try {
      // Delete all messages
      const deletePromises = messages.map((message) =>
        deleteMessageMutation.mutateAsync(message.id)
      );
      await Promise.all(deletePromises);
      
      toast.success(t('toast.inboxCleared'), {
        description: t('toast.inboxClearedDesc'),
      });
    } catch (error) {
      toast.error(t('toast.clearFailed'), {
        description: t('toast.clearFailedDesc'),
      });
    }
  }, [messages, deleteMessageMutation, t]);

  // Start/stop polling
  const togglePolling = useCallback(() => {
    setIsPolling(!isPolling);
  }, [isPolling]);

  // Manual refresh - bypass cache for immediate results
  const refreshInbox = useCallback(async () => {
    // Force refresh by bypassing both client and server cache
    try {
      console.log(`🔄 [MANUAL REFRESH] Forcing server cache bypass for ${currentEmail}`);
      const freshMessages = await api.getMessages(currentEmail, true);
      queryClient.setQueryData(["/api/email", currentEmail], freshMessages);
      setLoadTime(0); // Will be updated by next query
      setLastRefresh(new Date());
      toast.info(t('toast.refreshing'), {
        description: t('toast.refreshingDesc'),
      });
    } catch (error) {
      console.error('Manual refresh failed:', error);
      toast.error('Refresh failed', {
        description: 'Please try again',
      });
    }
  }, [currentEmail, queryClient, t]);

  // Track previous message count for new message detection
  const [prevMessageIds, setPrevMessageIds] = useState<string[]>([]);

  // Reset prevMessageIds when email changes
  useEffect(() => {
    setPrevMessageIds([]);
  }, [currentEmail]);

  // Auto-validate links for new messages and show notification
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[0];
      const currentIds = messages.map(m => m.id);
      
      // Check if there's a new message (including the first one)
      const isNewMessage = !prevMessageIds.includes(latestMessage.id);
      
      if (isNewMessage) {
        console.log('🆕 [AUTO-VALIDATION] New message detected:', latestMessage.id);
        console.log('🔧 [AUTO-VALIDATION] Settings:', { 
          autoValidation: settings.autoValidation, 
          delay: settings.autoValidationDelay 
        });
        
        // Auto-validate if enabled (do this first to get link type)
        if (settings.autoValidation) {
          setTimeout(async () => {
            // Check if already validated before triggering
            const existingValidation = await api.getValidationStatus(latestMessage.id);
            if (existingValidation && existingValidation.status !== 'pending') {
              console.log('⏭️ [AUTO-VALIDATION] Already validated, skipping:', latestMessage.id);
              return;
            }
            console.log('🚀 [AUTO-VALIDATION] Triggering validation for:', latestMessage.id);
            validateLinksMutation.mutate(latestMessage.id);
            
            // After validation starts, get the validation status to show notification with link type
            setTimeout(async () => {
              const validation = await api.getValidationStatus(latestMessage.id);
              
              // Show toast notification
              if (settings.showNotifications) {
                const linkTypeText = validation?.linkType 
                  ? `${validation.linkType.provider} - ${validation.linkType.type}`
                  : '';
                
                toast.success(t('toast.newMessageReceived'), {
                  description: t('toast.newMessageReceivedDesc', { 
                    from: latestMessage.fromAddress, 
                    subject: latestMessage.subject 
                  }) + (linkTypeText ? ` (${linkTypeText})` : ''),
                  duration: 4000,
                });
              }

              // Show browser notification
              if (BrowserNotificationService.isSupported()) {
                BrowserNotificationService.showEmailNotification({
                  from: latestMessage.fromAddress,
                  subject: latestMessage.subject,
                  linkType: validation?.linkType,
                  t,
                });
              }
            }, 500); // Wait a bit for validation to start
          }, settings.autoValidationDelay);
        } else {
          console.log('⚠️ [AUTO-VALIDATION] Auto-validation is disabled');
          // Show notifications without validation
          if (settings.showNotifications) {
            toast.success(t('toast.newMessageReceived'), {
              description: t('toast.newMessageReceivedDesc', { 
                from: latestMessage.fromAddress, 
                subject: latestMessage.subject 
              }),
              duration: 4000,
            });
          }

          // Show browser notification
          if (BrowserNotificationService.isSupported()) {
            BrowserNotificationService.showEmailNotification({
              from: latestMessage.fromAddress,
              subject: latestMessage.subject,
              t,
            });
          }
        }
      }
      
      // Update previous message IDs
      setPrevMessageIds(currentIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0 ? messages[0]?.id : null]);

  // Update email history with message count
  useEffect(() => {
    if (currentEmail && messages.length >= 0) {
      updateEmailHistory(currentEmail, { messageCount: messages.length });
    }
  }, [currentEmail, messages.length, updateEmailHistory]);

  // Start polling by default for auto-refresh
  useEffect(() => {
    setIsPolling(true);
    // Request notification permission on mount
    if (settings.showNotifications && BrowserNotificationService.isSupported()) {
      BrowserNotificationService.requestPermission();
    }
  }, [settings.showNotifications]);

  return {
    currentEmail,
    messages,
    isLoading,
    error,
    systemStatus,
    isPolling,
    pollingInterval,
    lastRefresh,
    loadTime,
    copyEmail,
    generateNewEmail,
    setCustomEmail,
    clearInbox,
    togglePolling,
    refreshInbox,
    deleteMessage: deleteMessageMutation.mutate,
    validateLinks: validateLinksMutation.mutate,
    isDeleting: deleteMessageMutation.isPending,
    isValidating: validateLinksMutation.isPending,
  };
}
