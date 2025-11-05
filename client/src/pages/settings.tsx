import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { Gear, CheckCircle, ArrowsLeftRight, ArrowCounterClockwise, Bell, ShieldCheck } from "@phosphor-icons/react";
import { useSettings } from "@/hooks/use-settings";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { t } = useTranslation();
  const { user } = useAuth();

  const updateUserSettingsMutation = useMutation({
    mutationFn: async (autoValidateInbox: boolean) => {
      const res = await apiRequest('PUT', '/api/auth/settings', { autoValidateInbox });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
      toast.success("Paramètres mis à jour", {
        description: "Vos préférences de validation ont été enregistrées",
      });
    },
    onError: () => {
      toast.error("Erreur", {
        description: "Impossible de mettre à jour les paramètres",
      });
    },
  });

  const handleReset = () => {
    resetSettings();
    toast.success("Paramètres réinitialisés", {
      description: "Tous les paramètres ont été restaurés aux valeurs par défaut",
    });
  };

  const swipeActionOptions = [
    { value: 'archive', label: 'Archiver' },
    { value: 'delete', label: 'Supprimer' },
    { value: 'none', label: 'Aucune action' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
        <PageHeader
          icon={<Gear className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title={t('pages.settings.title')}
          subtitle={t('pages.settings.subtitle')}
          iconGradient="bg-gradient-to-br from-emerald-400 to-emerald-600"
        />

        <div className="space-y-6">
          {/* Auto-validation */}
          <Card className="border-2 hover:border-green-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" weight="fill" />
                Auto-validation des emails
              </CardTitle>
              <CardDescription>
                Valide automatiquement les liens de vérification reçus par email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-validation">Activer l'auto-validation</Label>
                  <p className="text-sm text-muted-foreground">
                    Les liens de validation seront automatiquement cliqués dès réception
                  </p>
                </div>
                <Switch
                  id="auto-validation"
                  checked={settings.autoValidation}
                  onCheckedChange={(checked) =>
                    updateSettings({ autoValidation: checked })
                  }
                  data-testid="switch-auto-validation"
                />
              </div>
            </CardContent>
          </Card>

          {/* Notification Position */}
          <Card className="border-2 hover:border-yellow-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-yellow-500" weight="fill" />
                Position des notifications
              </CardTitle>
              <CardDescription>
                Choisissez où afficher les notifications sur l'écran
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notification-position">Position d'affichage</Label>
                <Select
                  value={settings.notificationPosition}
                  onValueChange={(value: 'top-right' | 'bottom') =>
                    updateSettings({ notificationPosition: value })
                  }
                >
                  <SelectTrigger id="notification-position" data-testid="select-notification-position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-right">En haut à droite</SelectItem>
                    <SelectItem value="bottom">En bas de l'écran</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Les notifications apparaîtront à la position sélectionnée
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Inbox Auto-validation (authenticated users only) */}
          {user && (
            <Card className="border-2 hover:border-purple-500/50 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-purple-500" weight="fill" />
                  Validation automatique des emails (Inbox)
                </CardTitle>
                <CardDescription>
                  Active la validation Playwright pour tous les emails reçus dans votre inbox personnel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-validate-inbox">Activer pour {user.username}@antdev.org</Label>
                    <p className="text-sm text-muted-foreground">
                      Tous les emails reçus sur vos adresses ({user.username}@, {user.username}0@, etc.) seront automatiquement validés
                    </p>
                  </div>
                  <Switch
                    id="auto-validate-inbox"
                    checked={user.autoValidateInbox ?? true}
                    onCheckedChange={(checked) => {
                      updateUserSettingsMutation.mutate(checked);
                    }}
                    data-testid="switch-auto-validate-inbox"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Swipe Actions */}
          <Card className="border-2 hover:border-blue-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowsLeftRight className="h-5 w-5 text-blue-500" weight="fill" />
                Actions de swipe
              </CardTitle>
              <CardDescription>
                Configurez les actions des gestes de balayage sur les emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="left-swipe">Swipe vers la gauche</Label>
                <Select
                  value={settings.swipeActions.leftSwipe}
                  onValueChange={(value: 'archive' | 'delete' | 'none') =>
                    updateSettings({
                      swipeActions: {
                        ...settings.swipeActions,
                        leftSwipe: value,
                      },
                    })
                  }
                >
                  <SelectTrigger id="left-swipe" data-testid="select-left-swipe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {swipeActionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Action déclenchée en glissant un email vers la gauche
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="right-swipe">Swipe vers la droite</Label>
                <Select
                  value={settings.swipeActions.rightSwipe}
                  onValueChange={(value: 'archive' | 'delete' | 'none') =>
                    updateSettings({
                      swipeActions: {
                        ...settings.swipeActions,
                        rightSwipe: value,
                      },
                    })
                  }
                >
                  <SelectTrigger id="right-swipe" data-testid="select-right-swipe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {swipeActionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Action déclenchée en glissant un email vers la droite
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Reset */}
          <Card className="border-2 border-destructive/20 hover:border-destructive/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ArrowCounterClockwise className="h-5 w-5" weight="fill" />
                Réinitialiser
              </CardTitle>
              <CardDescription>
                Restaurer tous les paramètres par défaut
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                onClick={handleReset}
                className="w-full gap-2"
                data-testid="button-reset-settings"
              >
                <ArrowCounterClockwise className="h-4 w-4" weight="bold" />
                Réinitialiser tous les paramètres
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
