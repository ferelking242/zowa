import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useEmailBoxes } from "@/hooks/use-email-boxes";
import { type Message } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { 
  Mail, 
  Trash2, 
  RefreshCw, 
  Search, 
  Menu,
  Inbox as InboxIcon,
  Clock,
  ChevronLeft,
  MoreVertical,
  Star,
  Archive,
  Reply,
  Forward
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { EmailDetailView } from "@/components/email-detail-view";

export default function Inbox() {
  const { t } = useTranslation();
  const { emailBoxes, getUserEmailBoxes, createNumberedUserBox, isUserAuthenticated } = useEmailBoxes();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(9);
  const [isRangeMode, setIsRangeMode] = useState(false);

  const getEmailNumber = (email: string): number | null => {
    const match = email.match(/^([a-z]+)(\d*)@/);
    if (!match) return null;
    return match[2] ? parseInt(match[2]) : 0;
  };

  const { data: allMessages = [], isLoading, refetch } = useQuery<Message[]>({
    queryKey: ['/api/inbox/all', emailBoxes.map(b => b.fullEmail)],
    queryFn: async () => {
      console.log(`🔄 [INBOX] Starting PARALLEL fetch for ${emailBoxes.length} email boxes`);
      
      const fetchPromises = emailBoxes.map(async (box) => {
        try {
          console.log(`📨 [INBOX] Fetching messages for: ${box.fullEmail}`);
          const response = await fetch(`/api/email/${box.fullEmail}`);
          if (response.ok) {
            const boxMessages = await response.json();
            console.log(`✅ [INBOX] Got ${boxMessages.length} messages from ${box.fullEmail}`);
            return boxMessages;
          }
          return [];
        } catch (error) {
          console.error(`❌ [INBOX] Failed to fetch messages for ${box.fullEmail}`, error);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      const messages = results.flat();
      
      console.log(`🏁 [INBOX] PARALLEL fetch completed: ${messages.length} messages`);
      
      return messages.sort((a, b) => b.createdAt - a.createdAt);
    },
    refetchInterval: false,
    enabled: emailBoxes.length > 0,
  });

  const filteredMessages = allMessages.filter(msg => {
    const matchesSearch = 
      msg.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.fromAddress.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesBox = !selectedBox || msg.toAddress === selectedBox;
    
    return matchesSearch && matchesBox;
  });

  useEffect(() => {
    if (selectedMessage && !filteredMessages.find(m => m.id === selectedMessage.id)) {
      setSelectedMessage(null);
    }
  }, [filteredMessages, selectedMessage]);

  const getBoxStats = (boxEmail: string) => {
    const messages = allMessages.filter(m => m.toAddress === boxEmail);
    return {
      total: messages.length,
      unread: messages.length,
    };
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}j`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return "maintenant";
  };

  const getInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.slice(0, 2).toUpperCase();
  };

  const getPreview = (message: Message) => {
    if (message.textContent) {
      return message.textContent.slice(0, 100);
    }
    return "Aucun aperçu disponible";
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await fetch(`/api/message/${messageId}`, { method: 'DELETE' });
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
      refetch();
    } catch (error) {
      console.error('Failed to delete message', error);
    }
  };

  const Sidebar = () => {
    const userBoxes = isUserAuthenticated ? getUserEmailBoxes() : emailBoxes;
    const availableNumbers = isUserAuthenticated 
      ? userBoxes.map(box => box.number).sort((a, b) => a - b)
      : [];

    return (
      <div className="h-full flex flex-col bg-background border-r border-border">
        <div className="p-4 border-b border-border">
          <Link href="/">
            <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="button-back-home">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Accueil
            </Button>
          </Link>
        </div>

        {isUserAuthenticated && userBoxes.length > 0 && (
          <>
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-12 h-12 border-2 border-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-bold text-lg">
                    {userBoxes[0]?.prefix.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{userBoxes[0]?.prefix}@antdev.org</p>
                  <p className="text-xs text-muted-foreground">Email principal</p>
                </div>
              </div>
              
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Sélecteur d'emails numérotés</p>
                
                {!isRangeMode ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
                        const hasBox = availableNumbers.includes(num);
                        const box = userBoxes.find(b => b.number === num);
                        const messageCount = box ? getBoxStats(box.fullEmail).total : 0;
                        
                        return (
                          <Button
                            key={num}
                            size="sm"
                            variant={selectedNumber === num ? "default" : hasBox ? "outline" : "ghost"}
                            className={cn(
                              "relative h-9 w-11 font-semibold transition-all",
                              selectedNumber === num && "ring-2 ring-primary ring-offset-2",
                              num === 0 && "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70"
                            )}
                            onClick={() => {
                              let targetBox = box;
                              if (!hasBox) {
                                targetBox = createNumberedUserBox(num) || undefined;
                              }
                              setSelectedNumber(num);
                              setSelectedBox(targetBox?.fullEmail || null);
                              setSelectedMessage(null);
                              setMobileMenuOpen(false);
                            }}
                            data-testid={`button-email-number-${num}`}
                          >
                            {num === 0 ? '@' : num}
                            {messageCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-lg border border-background">
                                {messageCount}
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <div className="mt-3">
                      <Input
                        type="number"
                        placeholder="Autre numéro (0-1000000)..."
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const num = parseInt((e.target as HTMLInputElement).value);
                            if (!isNaN(num) && num >= 0 && num <= 1000000) {
                              const box = userBoxes.find(b => b.number === num) || createNumberedUserBox(num) || undefined;
                              setSelectedNumber(num);
                              setSelectedBox(box?.fullEmail || null);
                              setSelectedMessage(null);
                              setMobileMenuOpen(false);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        data-testid="input-custom-email-number"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Début</label>
                        <Input
                          type="number"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(parseInt(e.target.value) || 0)}
                          min={0}
                          max={1000000}
                          className="h-8 text-xs"
                          data-testid="input-range-start"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Fin</label>
                        <Input
                          type="number"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(parseInt(e.target.value) || 0)}
                          min={0}
                          max={1000000}
                          className="h-8 text-xs"
                          data-testid="input-range-end"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => {
                        const start = Math.min(rangeStart, rangeEnd);
                        const end = Math.max(rangeStart, rangeEnd);
                        
                        if (end - start >= 100) {
                          alert('La plage ne peut pas dépasser 100 emails. Veuillez ajuster vos valeurs.');
                          return;
                        }
                        
                        for (let i = start; i <= end; i++) {
                          if (!userBoxes.find(b => b.number === i)) {
                            createNumberedUserBox(i);
                          }
                        }
                        
                        setSelectedBox(null);
                        setSelectedNumber(null);
                        setSelectedMessage(null);
                        refetch();
                      }}
                      data-testid="button-apply-range"
                    >
                      Surveiller la plage ({rangeStart}-{rangeEnd})
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Maximum 100 emails à la fois
                    </p>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 h-8 text-xs"
                  onClick={() => setIsRangeMode(!isRangeMode)}
                  data-testid="button-toggle-range-mode"
                >
                  {isRangeMode ? '📊 Mode Normal' : '📈 Mode Plage'}
                </Button>
              </div>
            </div>
          </>
        )}

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            <Button
              variant={selectedBox === null && selectedNumber === null ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => {
                setSelectedBox(null);
                setSelectedNumber(null);
                setSelectedMessage(null);
                setMobileMenuOpen(false);
              }}
              data-testid="button-all-boxes"
            >
              <InboxIcon className="w-4 h-4 mr-3" />
              <span className="flex-1 text-left">Tous les messages</span>
              <Badge variant="secondary" className="ml-auto">
                {allMessages.length}
              </Badge>
            </Button>
            
            {!isUserAuthenticated && emailBoxes.map((box) => {
              const stats = getBoxStats(box.fullEmail);
              return (
                <Button
                  key={box.id}
                  variant={selectedBox === box.fullEmail ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedBox(box.fullEmail);
                    setSelectedMessage(null);
                    setMobileMenuOpen(false);
                  }}
                  data-testid={`button-box-${box.id}`}
                >
                  <Mail className="w-4 h-4 mr-3" />
                  <div className="flex-1 text-left truncate">
                    <div className="text-sm font-medium truncate">{box.fullEmail}</div>
                  </div>
                  {stats.total > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {stats.total}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          {emailBoxes.length === 0 && (
            <div className="text-center py-8 px-4 text-muted-foreground text-sm">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Aucune boîte email</p>
              <Link href="/">
                <Button variant="link" size="sm" className="mt-2">
                  Créer une boîte
                </Button>
              </Link>
            </div>
          )}
        </ScrollArea>
      </div>
    );
  };

  const MessageList = () => (
    <div className="h-full flex flex-col bg-background border-r border-border">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="button-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <Sidebar />
              </SheetContent>
            </Sheet>
            <h2 className="text-lg font-semibold hidden sm:block">
              {selectedBox ? emailBoxes.find(b => b.fullEmail === selectedBox)?.fullEmail : "Tous les messages"}
            </h2>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-inbox"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="pl-10"
            data-testid="input-search-emails"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && filteredMessages.length === 0 ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Aucun email trouvé' : 'Aucun email'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredMessages.map((message) => (
              <button
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                className={cn(
                  "w-full p-4 hover:bg-muted/50 transition-colors text-left",
                  selectedMessage?.id === message.id && "bg-muted"
                )}
                data-testid={`message-row-${message.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback>{getInitials(message.fromAddress)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm truncate" data-testid={`text-from-${message.id}`}>
                        {message.fromAddress.split('@')[0]}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2" data-testid={`text-time-${message.id}`}>
                        {formatTimeAgo(message.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm font-medium truncate mb-1" data-testid={`text-subject-${message.id}`}>
                      {message.subject}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {getPreview(message)}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {isUserAuthenticated ? (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs font-bold border-2",
                            getEmailNumber(message.toAddress) === 0 
                              ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-primary shadow-sm" 
                              : "bg-primary/10 text-primary border-primary/30"
                          )}
                        >
                          {getEmailNumber(message.toAddress) === 0 ? '@ Principal' : `#${getEmailNumber(message.toAddress)}`}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {message.toAddress.split('@')[0]}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid lg:grid-cols-[280px_400px_1fr] md:grid-cols-[280px_1fr] grid-cols-1">
          <div className="hidden lg:block">
            <Sidebar />
          </div>

          <MessageList />

          <div className="hidden md:block">
            {selectedMessage ? (
              <EmailDetailView 
                message={selectedMessage} 
                onDelete={handleDeleteMessage}
                onClose={() => setSelectedMessage(null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Sélectionnez un message</p>
                </div>
              </div>
            )}
          </div>

          {selectedMessage && (
            <div className="md:hidden fixed inset-0 bg-background z-50">
              <EmailDetailView 
                message={selectedMessage} 
                onDelete={handleDeleteMessage}
                onClose={() => setSelectedMessage(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
