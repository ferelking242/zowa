import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Inbox, MailOpen } from "lucide-react";
import { MessageItem } from "./message-item";
import { type Message } from "@shared/schema";
import { useTranslation } from "react-i18next";

interface InboxListProps {
  messages: Message[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteMessage: (inboxId: string) => void;
  isDeleting: boolean;
  systemStatus?: { activeBrowsers: number; maxBrowsers: number; status: string };
  lastRefresh?: Date | null;
  loadTime?: number;
}

export function InboxList({ 
  messages, 
  isLoading, 
  onRefresh, 
  onDeleteMessage, 
  isDeleting,
  systemStatus,
  lastRefresh,
  loadTime
}: InboxListProps) {
  const { t } = useTranslation();
  
  const getTimeAgo = (date: Date | null) => {
    if (!date) return '';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };
  
  return (
    <div className="space-y-4">
      <Card className="shadow-lg">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center">
                <Inbox className="w-4 h-4 sm:w-5 sm:h-5 text-primary mr-2" />
                {t('inbox.title')}
              </h3>
              {lastRefresh && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last refresh: {getTimeAgo(lastRefresh)}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground text-xs sm:text-sm"
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('inbox.refresh')}</span>
            </Button>
          </div>

          {/* Messages List - Extended with scrolling */}
          <div className="max-h-[700px] overflow-y-auto pr-2">
            {isLoading && messages.length === 0 ? (
              <div className="space-y-4">
                {/* Loading Skeletons */}
                <div className="border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-3"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
                </div>
                <div className="border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-2/3 mb-3"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
                </div>
                <div className="border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-3"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
                </div>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-4" data-testid="messages-list">
                {messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    onDelete={onDeleteMessage}
                    isDeleting={isDeleting}
                  />
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="text-center py-8 sm:py-12" data-testid="empty-state">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <MailOpen className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
                </div>
                <h4 className="text-base sm:text-lg font-semibold text-foreground mb-2">{t('inbox.empty')}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto px-4">
                  {t('inbox.emptyDesc')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
