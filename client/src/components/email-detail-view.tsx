import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Trash2, 
  MoreVertical, 
  Reply, 
  Forward, 
  Star,
  Clock,
  CheckCircle,
  Loader2,
  Link as LinkIcon
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EmailDetailViewProps {
  message: Message;
  onDelete: (messageId: string) => void;
  onClose: () => void;
}

export function EmailDetailView({ message, onDelete, onClose }: EmailDetailViewProps) {
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
    return <IconComponent className="w-4 h-4" />;
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

  const { data: fullMessage, isLoading: isLoadingContent } = useQuery({
    queryKey: ["/api/inbox", message.id],
    queryFn: () => api.getMessageDetails(message.id),
  });

  const { data: validation } = useQuery({
    queryKey: ["/api/validation", message.id],
    queryFn: () => api.getValidationStatus(message.id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'pending' ? 2000 : false;
    },
  });

  const lastNotifiedStatus = useRef<string | null>(null);

  useEffect(() => {
    if (validation?.status) {
      const currentStatus = validation.status;

      if (currentStatus === 'success' && lastNotifiedStatus.current !== 'success') {
        const provider = validation.linkType?.provider || t('validation.defaultProvider');
        toast.success(t('toast.linkValidationSuccess'), {
          description: t('toast.linkValidationSuccessDesc', { provider }),
          duration: 5000,
        });
        lastNotifiedStatus.current = 'success';
      }

      if (currentStatus === 'failed' && lastNotifiedStatus.current !== 'failed') {
        toast.error(t('toast.linkValidationFailed'), {
          description: t('toast.linkValidationFailedDesc'),
          duration: 5000,
        });
        lastNotifiedStatus.current = 'failed';
      }

      if (currentStatus === 'pending' && lastNotifiedStatus.current !== null) {
        lastNotifiedStatus.current = null;
      }
    }
  }, [validation?.status, validation?.linkType?.provider, t]);

  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatExpiresIn = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    return `${hours}h`;
  };

  const getInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.slice(0, 2).toUpperCase();
  };

  const getValidationBadge = () => {
    if (!validation) return null;

    const linkType = validation.linkType;
    const bgColor = linkType?.color ? getHexColor(linkType.color) : '#3b82f6';
    
    if (linkType) {
      const icon = linkType.icon;
      const provider = linkType.provider;
      
      switch (validation.status) {
        case 'success':
          return (
            <Badge 
              className="text-xs border flex items-center gap-1"
              style={{ 
                backgroundColor: `${bgColor}20`,
                color: bgColor,
                borderColor: `${bgColor}40`
              }}
            >
              {getIconComponent(icon)}
              <CheckCircle className="w-3 h-3" />
              {provider}
            </Badge>
          );
        case 'pending':
          return (
            <Badge 
              className="text-xs border flex items-center gap-1"
              style={{ 
                backgroundColor: `${bgColor}20`,
                color: bgColor,
                borderColor: `${bgColor}40`
              }}
            >
              {getIconComponent(icon)}
              <Loader2 className="w-3 h-3 animate-spin" />
              {provider}
            </Badge>
          );
        case 'failed':
          return (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              {getIconComponent(icon)}
              {provider}
            </Badge>
          );
      }
    }

    switch (validation.status) {
      case 'success':
        return (
          <Badge className="bg-accent/10 text-accent border-accent/20 dark:bg-accent/20 text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t('validation.verified')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 text-xs">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {t('validation.processing')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="text-xs">
            {t('validation.failed')}
          </Badge>
        );
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
        <div className="bg-accent/10 dark:bg-accent/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-accent">{t('validation.firebaseDetected')}</span>
            <Badge className="bg-accent text-accent-foreground text-xs">
              Firebase
            </Badge>
          </div>
          {validation.status === 'success' && (
            <div className="text-sm text-accent">
              ✅ {t('validation.autoVerified')}
            </div>
          )}
          <a
            href={decodedUrl}
            target="_blank"
            rel="noopener noreferrer"
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
          className="rounded-lg p-4 space-y-3 border"
          style={{ 
            backgroundColor: `${bgColor}15`,
            borderColor: `${bgColor}30`
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getIconComponent(icon)}</span>
              <div>
                <span className="text-sm font-medium" style={{ color: bgColor }}>
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
            <div className="text-sm" style={{ color: bgColor }}>
              ✅ {t('validation.autoVerified')}
            </div>
          )}
          <a
            href={decodedUrl}
            target="_blank"
            rel="noopener noreferrer"
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
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="md:hidden"
          data-testid="button-close-email"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onDelete(message.id);
            }}
            data-testid={`button-delete-${message.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-more-actions">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Reply className="w-4 h-4 mr-2" />
                Répondre
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Forward className="w-4 h-4 mr-2" />
                Transférer
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Star className="w-4 h-4 mr-2" />
                Marquer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <Avatar className="w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                <AvatarFallback>{getInitials(message.fromAddress)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-1">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base sm:text-lg truncate" data-testid={`text-from-${message.id}`}>
                      {message.fromAddress.split('@')[0]}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{message.fromAddress}</p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap" data-testid={`text-date-${message.id}`}>
                      {formatDateTime(message.createdAt)}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      <span data-testid={`text-expires-${message.id}`}>
                        Expire dans {formatExpiresIn(message.expiresAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs truncate max-w-full">
                    À: {message.toAddress}
                  </Badge>
                  {getValidationBadge()}
                </div>
              </div>
            </div>

            <div className="overflow-hidden">
              <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 break-words" data-testid={`text-subject-${message.id}`}>
                {message.subject}
              </h2>
            </div>
          </div>

          <Separator />

          <div className="prose prose-sm max-w-none dark:prose-invert overflow-hidden">
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div data-testid={`text-content-${message.id}`} className="overflow-hidden w-full">
                {fullMessage?.htmlContent ? (
                  <div className="w-full max-w-full overflow-hidden">
                    <div 
                      className="email-content w-full"
                      dangerouslySetInnerHTML={{ __html: fullMessage.htmlContent }} 
                    />
                  </div>
                ) : fullMessage?.textContent ? (
                  <p className="whitespace-pre-wrap break-words w-full max-w-full overflow-x-auto">{fullMessage.textContent}</p>
                ) : (
                  <p className="text-muted-foreground italic">{t('inbox.noContent')}</p>
                )}
              </div>
            )}
          </div>

          {getValidationDetails()}
        </div>
      </ScrollArea>
    </div>
  );
}
