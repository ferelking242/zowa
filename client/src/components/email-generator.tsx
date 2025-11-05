import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Copy, RefreshCw, Trash2, Info, Edit3, Check, X, ChevronDown, Globe } from "lucide-react";
import { type Message } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getAllDomains, EMAIL_PROVIDERS, getProviderByDomain } from "@shared/email-providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailGeneratorProps {
  currentEmail: string;
  messages: Message[];
  systemStatus?: { activeBrowsers: number; maxBrowsers: number; status: string };
  onCopyEmail: () => void;
  onGenerateNew: () => void;
  onSetCustomEmail: (username: string, domain?: string) => Promise<{ success: boolean; email?: string; error?: string }>;
  onClearInbox: () => void;
  isPolling: boolean;
  pollingInterval: number;
  selectedDomain: string;
  onDomainChange: (domain: string) => void;
}

export function EmailGenerator({
  currentEmail,
  messages,
  systemStatus,
  onCopyEmail,
  onGenerateNew,
  onSetCustomEmail,
  onClearInbox,
  isPolling,
  pollingInterval,
  selectedDomain,
  onDomainChange,
}: EmailGeneratorProps) {
  const { t } = useTranslation();
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customDomain, setCustomDomain] = useState(selectedDomain);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  useEffect(() => {
    setCustomDomain(selectedDomain);
  }, [selectedDomain]);

  const handleCustomInputChange = (value: string) => {
    const trimmedValue = value.trim();
    
    if (trimmedValue.includes('@')) {
      const parts = trimmedValue.split('@');
      const username = parts[0].trim();
      const domain = parts[1]?.trim();
      
      if (username && domain && getAllDomains().includes(domain)) {
        setCustomDomain(domain);
        setCustomInput(username);
        toast.success("Domaine détecté", {
          description: `Email configuré avec @${domain}`,
          duration: 2000,
        });
      } else if (domain && domain.length > 0) {
        setCustomInput(username);
        toast.error("Domaine non supporté", {
          description: `@${domain} n'est pas supporté. Utilisez le sélecteur de domaine.`,
          duration: 4000,
        });
      } else {
        setCustomInput(username);
      }
    } else {
      setCustomInput(trimmedValue);
    }
  };

  const handleSetCustomEmail = async () => {
    const username = customInput.trim();
    if (!username) return;
    
    if (!getAllDomains().includes(customDomain)) {
      toast.error("Domaine invalide", {
        description: "Veuillez sélectionner un domaine supporté",
      });
      return;
    }
    
    setIsCheckingAvailability(true);
    try {
      const result = await onSetCustomEmail(username, customDomain);
      toast.success(t('emailGenerator.emailSet'), {
        description: result.email,
      });
      setIsCustomMode(false);
      setCustomInput("");
    } catch (error) {
      toast.error(t('toast.copyFailed'), {
        description: t('emailGenerator.emailSetFailed'),
      });
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const messageCount = messages.length;
  const validatedCount = messages.filter(m => 
    m.textContent?.includes('verified') || m.textContent?.includes('confirmed')
  ).length;

  const formatExpirationTime = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    return `${hours}h`;
  };

  const expiresIn = messages.length > 0 ? formatExpirationTime(messages[0].expiresAt) : '72h';

  return (
    <div className="lg:sticky lg:top-24 h-fit space-y-4">
      <Card className="shadow-lg">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center">
              <span className="mr-2">@</span>
              {t('emailGenerator.yourEmail')}
            </h3>
            <Badge variant="secondary" className="bg-muted text-xs">
              {t('emailGenerator.active')}
            </Badge>
          </div>

          {/* Email Display */}
          <div className="bg-muted rounded-lg p-3 sm:p-4 mb-4 border border-border">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p 
                  className="font-mono text-xs sm:text-sm md:text-base font-semibold text-foreground truncate"
                  data-testid="current-email"
                >
                  {currentEmail}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={onCopyEmail}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 sm:px-4 py-2 flex-1 sm:flex-initial"
                  data-testid="button-copy-email"
                >
                  <Copy className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('emailGenerator.copy')}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="default"
                      className="gap-1 shrink-0 px-2 sm:px-3"
                      data-testid="button-domain-dropdown"
                    >
                      <span className="text-xs">@{selectedDomain}</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Sélectionner un domaine</DropdownMenuLabel>
                    <div className="p-1">
                      {getAllDomains().map((domain) => (
                        <DropdownMenuItem
                          key={domain}
                          onClick={() => onDomainChange(domain)}
                          className={selectedDomain === domain ? 'bg-primary/10' : ''}
                          data-testid={`dropdown-item-${domain}`}
                        >
                          @{domain}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {isCustomMode ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Saisir un email personnalisé
                </label>
                <div className="flex gap-2">
                  <Input
                    value={customInput}
                    onChange={(e) => handleCustomInputChange(e.target.value)}
                    placeholder="username ou username@domain.com"
                    className="flex-1 min-w-0"
                    data-testid="input-custom-email"
                    onKeyPress={(e) => e.key === 'Enter' && handleSetCustomEmail()}
                  />
                  <Select value={customDomain} onValueChange={setCustomDomain}>
                    <SelectTrigger className="w-[160px]" data-testid="select-domain">
                      <SelectValue>
                        <span className="text-sm">@{customDomain}</span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {getAllDomains().map((domain) => (
                        <SelectItem key={domain} value={domain}>
                          @{domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Astuce : Tapez directement "username@domain.com" pour détecter le domaine automatiquement
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSetCustomEmail}
                  disabled={!customInput.trim() || isCheckingAvailability}
                  className="flex-1"
                  data-testid="button-set-custom-email"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {t('emailGenerator.checkAvailability')}
                </Button>
                <Button
                  onClick={() => {
                    setIsCustomMode(false);
                    setCustomInput("");
                    setCustomDomain(selectedDomain);
                  }}
                  variant="outline"
                  data-testid="button-cancel-custom"
                >
                  <X className="w-4 h-4 mr-2" />
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={onGenerateNew}
                variant="default"
                className="w-full"
                data-testid="button-generate-new"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('emailGenerator.generateNew')}
              </Button>
              <Button
                onClick={() => setIsCustomMode(true)}
                variant="outline"
                className="w-full"
                data-testid="button-custom-email"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                {t('emailGenerator.customEmail')}
              </Button>
              <Button
                onClick={onClearInbox}
                variant="destructive"
                className="w-full"
                data-testid="button-clear-inbox"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('emailGenerator.clearInbox')}
              </Button>
            </div>
          )}

          {/* Stats Section */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary" data-testid="text-message-count">
                  {messageCount}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('emailGenerator.messages')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent" data-testid="text-validated-count">
                  {validatedCount}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('emailGenerator.validated')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary" data-testid="text-expires-in">
                  {expiresIn}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('inbox.expiresIn')}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Status & Provider Card */}
      <Card className="shadow-md">
        <CardContent className="p-4 space-y-4">
          {/* Provider Selector */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase">Fournisseur d'email</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  data-testid="button-provider-selector"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm">{getProviderByDomain(selectedDomain)?.name || 'DevTai Email'}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Choisir un fournisseur d'email</DropdownMenuLabel>
                <div className="p-1">
                  {EMAIL_PROVIDERS.map((provider) => (
                    <DropdownMenuItem
                      key={provider.id}
                      onClick={() => onDomainChange(provider.domains[0])}
                      className="cursor-pointer py-3"
                      data-testid={`dropdown-provider-${provider.id}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-medium">{provider.name}</span>
                          {provider.features.unlimited && (
                            <Badge variant="secondary" className="text-xs">Illimité</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Status */}
          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-accent animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-xs font-medium text-foreground">
                  {isPolling ? t('emailGenerator.autoRefresh') : t('emailGenerator.paused')}
                </span>
              </div>
            </div>
            
            {systemStatus && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('emailGenerator.activeBrowsers')}:</span>
                <span className="font-mono text-foreground" data-testid="text-active-browsers">
                  {systemStatus.activeBrowsers}/{systemStatus.maxBrowsers}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
