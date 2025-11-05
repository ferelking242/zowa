import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Trash2, CheckCircle, Loader2, Link as LinkIcon } from "lucide-react";
import { type Message } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { 
  SiGoogle, 
  SiReplit, 
  SiTelegram, 
  SiGithub, 
  SiDiscord, 
  SiLinkedin, 
  SiX, 
  SiStripe, 
  SiVercel 
} from "react-icons/si";

interface MessageItemProps {
  message: Message;
  onDelete: (inboxId: string) => void;
  isDeleting: boolean;
}

export function MessageItem({ message, onDelete, isDeleting }: MessageItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  const getIconComponent = (iconName: string) => {
    const iconMap: Record<string, any> = {
      'SiGoogle': SiGoogle,
      'SiReplit': SiReplit,
      'SiTelegram': SiTelegram,
      'SiGithub': SiGithub,
      'SiDiscord': SiDiscord,
      'SiLinkedin': SiLinkedin,
      'SiX': SiX,
      'SiMicrosoft': LinkIcon,
      'SiStripe': SiStripe,
      'SiVercel': SiVercel,
      'Link': LinkIcon,
    };
    const IconComponent = iconMap[iconName] || LinkIcon;
    return <IconComponent className="w-3 h-3" />;
  };

  const getHexColor = (tailwindClass: string): string => {
    const colorMap: Record<string, string> = {
      'text-red-500': '#ef4444',
      'text-orange-500': '#f97316',
      'text-blue-400': '#60a5fa',
      'text-blue-500': '#3b82f6',
      'text-blue-600': '#2563eb',
      'text-indigo-500': '#6366f1',
      'text-purple-600': '#9333ea',
      'text-amber-500': '#f59e0b',
      'text-gray-700 dark:text-gray-300': '#6b7280',
      'text-black dark:text-white': '#000000',
      'text-muted-foreground': '#71717a',
      'text-primary': '#3b82f6',
    };
    return colorMap[tailwindClass] || '#3b82f6';
  };

  // Get full message content when expanded
  const { data: fullMessage, isLoading: isLoadingContent } = useQuery({
    queryKey: ["/api/inbox", message.id],
    queryFn: () => api.getMessageDetails(message.id),
    enabled: isExpanded,
  });

  // Get validation status for this message
  const { data: validation } = useQuery({
    queryKey: ["/api/validation", message.id],
    queryFn: () => api.getValidationStatus(message.id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'pending' ? 2000 : false;
    },
  });

  // Track which status we've already notified for
  const lastNotifiedStatus = useRef<string | null>(null);

  // Show notification when validation completes successfully
  useEffect(() => {
    if (validation?.status) {
      const currentStatus = validation.status;

      // Show success notification when we reach success state and haven't notified for it yet
      if (currentStatus === 'success' && lastNotifiedStatus.current !== 'success') {
        const provider = validation.linkType?.provider || t('validation.defaultProvider');
        toast.success(t('toast.linkValidationSuccess'), {
          description: t('toast.linkValidationSuccessDesc', { provider }),
          duration: 5000,
        });
        lastNotifiedStatus.current = 'success';
      }

      // Show error notification when we reach failed state and haven't notified for it yet
      if (currentStatus === 'failed' && lastNotifiedStatus.current !== 'failed') {
        toast.error(t('toast.linkValidationFailed'), {
          description: t('toast.linkValidationFailedDesc'),
          duration: 5000,
        });
        lastNotifiedStatus.current = 'failed';
      }

      // Reset notification tracking when returning to pending (for retries)
      if (currentStatus === 'pending' && lastNotifiedStatus.current !== null) {
        lastNotifiedStatus.current = null;
      }
    }
  }, [validation?.status, validation?.linkType?.provider, t]);

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours > 0) return `${hours}h ${t('inbox.ago')}`;
    if (minutes > 0) return `${minutes}m ${t('inbox.ago')}`;
    return t('inbox.justNow');
  };

  const formatExpiresIn = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    return `${hours}h`;
  };

  const getValidationBadge = () => {
    if (!validation) return null;

    // Simple badges - just show status with icon
    switch (validation.status) {
      case 'success':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-500/20 dark:text-green-400 text-xs flex items-center gap-1 px-2">
            <CheckCircle className="w-3 h-3" />
            <span className="hidden sm:inline">{t('validation.verified')}</span>
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 text-xs flex items-center gap-1 px-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden sm:inline">{t('validation.processing')}</span>
          </Badge>
        );
      case 'failed':
        return null; // Don't show failed badge
      default:
        return null;
    }
  };

  const getValidationDetails = () => {
    if (!validation) return null;

    const decodedUrl = validation.url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    if (validation.method === 'firebase') {
      return (
        <div className="bg-accent/10 dark:bg-accent/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-accent">{t('validation.firebaseDetected')}</span>
            <Badge className="bg-accent text-accent-foreground text-xs">
              Firebase
            </Badge>
          </div>
          {validation.status === 'success' && (
            <div className="text-xs text-accent">
              ✅ {t('validation.autoVerified')}
            </div>
          )}
          <a
            href={decodedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block w-full"
          >
            <Button 
              variant="default" 
              size="sm" 
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              data-testid={`button-verify-${message.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('validation.clickToVerify')}
            </Button>
          </a>
        </div>
      );
    }

    if (validation.method === 'playwright') {
      const linkType = validation.linkType;
      const bgColor = linkType?.color ? getHexColor(linkType.color) : '#3b82f6';
      const provider = linkType?.provider || t('validation.defaultProvider');
      const icon = linkType?.icon || 'Link';
      const typeLabel = linkType?.type ? {
        verification: t('validation.types.verification'),
        reset: t('validation.types.reset'),
        confirmation: t('validation.types.confirmation'),
        action: t('validation.types.action'),
        unknown: t('validation.types.unknown'),
      }[linkType.type] : '';

      return (
        <div 
          className="rounded-lg p-3 space-y-2 border"
          style={{ 
            backgroundColor: `${bgColor}15`,
            borderColor: `${bgColor}30`
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getIconComponent(icon)}</span>
              <div>
                <span className="text-xs sm:text-sm font-medium" style={{ color: bgColor }}>
                  {provider}
                </span>
                {typeLabel && (
                  <p className="text-xs opacity-70" style={{ color: bgColor }}>
                    {typeLabel}
                  </p>
                )}
              </div>
            </div>
            <span className="text-xs opacity-70" style={{ color: bgColor }}>
              {validation.status === 'pending' ? t('validation.validating') : t('validation.validated')}
            </span>
          </div>
          {validation.status === 'success' && (
            <div className="text-xs" style={{ color: bgColor }}>
              ✅ {t('validation.autoVerified')}
            </div>
          )}
          <a
            href={decodedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block w-full"
          >
            <Button 
              variant="default" 
              size="sm" 
              className="w-full"
              style={{ 
                backgroundColor: bgColor,
                color: 'white'
              }}
              data-testid={`button-verify-${message.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('validation.clickToVerify')}
            </Button>
          </a>
        </div>
      );
    }

    return null;
  };

  return (
    <Card 
      className="border border-border hover:border-primary/50 transition-colors cursor-pointer w-full overflow-hidden"
      onClick={() => setIsExpanded(!isExpanded)}
      data-testid={`card-message-${message.id}`}
    >
      <CardContent className="p-4 w-full overflow-hidden">
        <div className="flex items-start justify-between mb-2 w-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-1 overflow-hidden">
              <h4 
                className="font-semibold text-foreground truncate flex-shrink min-w-0"
                data-testid={`text-subject-${message.id}`}
              >
                {message.subject}
              </h4>
              <div className="flex-shrink-0">
                {getValidationBadge()}
              </div>
            </div>
            <p 
              className="text-xs sm:text-sm text-muted-foreground truncate overflow-hidden"
              data-testid={`text-from-${message.id}`}
            >
              {t('inbox.from')}: {message.fromAddress}
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
          <span data-testid={`text-created-${message.id}`}>
            {formatTimeAgo(message.createdAt)}
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              <span data-testid={`text-expires-${message.id}`}>
                {t('inbox.expiresIn')} {formatExpiresIn(message.expiresAt)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(message.id);
              }}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive/80 p-1"
              data-testid={`button-delete-${message.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border fade-in overflow-hidden w-full">
            <div className="bg-muted rounded-lg p-4 mb-3 overflow-hidden w-full">
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div 
                  className="text-sm leading-relaxed email-content break-words overflow-hidden w-full"
                  data-testid={`text-content-${message.id}`}
                >
                  {fullMessage?.htmlContent ? (
                    <div className="break-words overflow-wrap-anywhere" dangerouslySetInnerHTML={{ __html: fullMessage.htmlContent }} />
                  ) : fullMessage?.textContent ? (
                    <p className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{fullMessage.textContent}</p>
                  ) : (
                    <p className="text-muted-foreground italic">{t('inbox.noContent')}</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Link Validation Status */}
            {getValidationDetails()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
