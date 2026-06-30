import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClockCounterClockwise,
  MagnifyingGlass,
  Envelope,
  CheckCircle,
  XCircle,
  CalendarBlank,
  FunnelSimple,
} from "@phosphor-icons/react";
import { formatDistanceToNow, format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailHistory {
  email: string;
  lastChecked: string;
  messageCount: number;
  hasValidatedLinks: boolean;
  validationStatus: string | null;
  createdAt: string;
}

export default function History() {
  const [searchQuery, setSearchQuery] = useState("");
  const [messageFilter, setMessageFilter] = useState<"all" | "with-messages" | "no-messages">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "most-messages">("recent");

  const { data: emailHistory = [], isLoading } = useQuery<EmailHistory[]>({
    queryKey: ['/api/history'],
  });

  const filteredAndSortedHistory = useMemo(() => {
    let filtered = emailHistory.filter((entry) => {
      // Search filter
      if (searchQuery && !entry.email.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Message filter
      if (messageFilter === "with-messages" && entry.messageCount === 0) {
        return false;
      }
      if (messageFilter === "no-messages" && entry.messageCount > 0) {
        return false;
      }

      // Date filter
      if (dateFilter !== "all") {
        const entryDate = new Date(entry.lastChecked);
        const now = new Date();
        
        if (dateFilter === "today") {
          const todayStart = startOfDay(now);
          const todayEnd = endOfDay(now);
          if (isBefore(entryDate, todayStart) || isAfter(entryDate, todayEnd)) {
            return false;
          }
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (isBefore(entryDate, weekAgo)) {
            return false;
          }
        } else if (dateFilter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (isBefore(entryDate, monthAgo)) {
            return false;
          }
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.lastChecked).getTime() - new Date(a.lastChecked).getTime();
      } else if (sortBy === "oldest") {
        return new Date(a.lastChecked).getTime() - new Date(b.lastChecked).getTime();
      } else if (sortBy === "most-messages") {
        return b.messageCount - a.messageCount;
      }
      return 0;
    });

    return filtered;
  }, [emailHistory, searchQuery, messageFilter, dateFilter, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
        <PageHeader
          icon={<ClockCounterClockwise className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title="Historique"
          subtitle="Consultez vos emails générés récemment"
          iconGradient="bg-gradient-to-br from-pink-400 to-pink-600"
        />

        <div className="space-y-6">
          {/* Search and Filters */}
          <Card className="border-2">
            <CardContent className="pt-6 space-y-4">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" weight="bold" />
                <Input
                  placeholder="Rechercher un email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-history"
                />
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Message Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <FunnelSimple className="h-3 w-3" weight="bold" />
                    Messages
                  </label>
                  <Select value={messageFilter} onValueChange={(v: any) => setMessageFilter(v)}>
                    <SelectTrigger data-testid="select-message-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="with-messages">Avec messages</SelectItem>
                      <SelectItem value="no-messages">Sans messages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Filter */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <CalendarBlank className="h-3 w-3" weight="bold" />
                    Période
                  </label>
                  <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
                    <SelectTrigger data-testid="select-date-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tout</SelectItem>
                      <SelectItem value="today">Aujourd'hui</SelectItem>
                      <SelectItem value="week">7 derniers jours</SelectItem>
                      <SelectItem value="month">30 derniers jours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Trier par
                  </label>
                  <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                    <SelectTrigger data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Plus récent</SelectItem>
                      <SelectItem value="oldest">Plus ancien</SelectItem>
                      <SelectItem value="most-messages">Plus de messages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Reset button */}
              {(searchQuery || messageFilter !== "all" || dateFilter !== "all" || sortBy !== "recent") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setMessageFilter("all");
                    setDateFilter("all");
                    setSortBy("recent");
                  }}
                  className="w-full sm:w-auto"
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredAndSortedHistory.length} email{filteredAndSortedHistory.length > 1 ? 's' : ''} trouvé{filteredAndSortedHistory.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <Card className="border-2">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Chargement...</p>
                </CardContent>
              </Card>
            ) : filteredAndSortedHistory.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-12 text-center">
                  <ClockCounterClockwise className="mx-auto h-12 w-12 text-muted-foreground mb-3" weight="fill" />
                  <p className="text-muted-foreground">
                    {emailHistory.length === 0 
                      ? "Aucun email dans l'historique" 
                      : "Aucun email ne correspond aux filtres"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredAndSortedHistory.map((entry, index) => (
                <Card key={index} className="border-2 hover:border-pink-500/30 transition-colors">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Icon */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Envelope className="h-5 w-5 text-pink-500 shrink-0" weight="fill" />
                        <div className="flex-1 min-w-0">
                          <code className="text-sm sm:text-base font-mono font-semibold truncate block" data-testid={`text-email-${index}`}>
                            {entry.email}
                          </code>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <p className="text-xs text-muted-foreground" data-testid={`text-last-checked-${index}`}>
                              Vérifié {formatDistanceToNow(new Date(entry.lastChecked), { addSuffix: true, locale: fr })}
                            </p>
                            {entry.createdAt && (
                              <p className="text-xs text-muted-foreground">
                                • Créé le {format(new Date(entry.createdAt), "dd/MM/yyyy à HH:mm", { locale: fr })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        {/* Message Count */}
                        <Badge 
                          variant={entry.messageCount > 0 ? "default" : "secondary"}
                          className="gap-1"
                        >
                          {entry.messageCount > 0 ? (
                            <>
                              <CheckCircle className="h-3 w-3" weight="fill" />
                              {entry.messageCount} message{entry.messageCount > 1 ? 's' : ''}
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" weight="fill" />
                              Aucun message
                            </>
                          )}
                        </Badge>

                        {/* Validation Status */}
                        {entry.hasValidatedLinks && (
                          <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400">
                            <CheckCircle className="h-3 w-3" weight="fill" />
                            Validé
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
