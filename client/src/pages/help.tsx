import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { Question, Keyboard, ArrowsLeftRight, Command } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

export default function Help() {
  const { t } = useTranslation();
  
  const keyboardShortcuts = [
    {
      category: "Navigation",
      shortcuts: [
        { keys: ["Ctrl/Cmd", "K"], description: "Ouvrir la recherche rapide" },
        { keys: ["Ctrl/Cmd", "N"], description: "Générer un nouvel email" },
        { keys: ["Ctrl/Cmd", "R"], description: "Rafraîchir la boîte de réception" },
        { keys: ["Esc"], description: "Fermer les dialogues/modales" },
      ],
    },
    {
      category: "Emails",
      shortcuts: [
        { keys: ["↑", "↓"], description: "Naviguer entre les emails" },
        { keys: ["Enter"], description: "Ouvrir l'email sélectionné" },
        { keys: ["Del"], description: "Supprimer l'email sélectionné" },
        { keys: ["Ctrl/Cmd", "C"], description: "Copier l'adresse email" },
      ],
    },
    {
      category: "Actions",
      shortcuts: [
        { keys: ["Ctrl/Cmd", "V"], description: "Valider le lien sélectionné" },
        { keys: ["Ctrl/Cmd", "A"], description: "Archiver l'email" },
        { keys: ["Space"], description: "Marquer comme lu/non-lu" },
      ],
    },
  ];

  const swipeActions = [
    {
      gesture: "Swipe gauche",
      icon: "←",
      defaultAction: "Archiver",
      description: "Glisser un email vers la gauche",
    },
    {
      gesture: "Swipe droite",
      icon: "→",
      defaultAction: "Supprimer",
      description: "Glisser un email vers la droite",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
        <PageHeader
          icon={<Question className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title={t('pages.help.title')}
          subtitle={t('pages.help.subtitle')}
          iconGradient="bg-gradient-to-br from-indigo-400 to-indigo-600"
        />

        <div className="space-y-6">
          {/* Keyboard Shortcuts */}
          <Card className="border-2 hover:border-indigo-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-indigo-500" weight="fill" />
                Raccourcis clavier
              </CardTitle>
              <CardDescription>
                Utilisez ces raccourcis pour naviguer plus rapidement dans l'application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {keyboardShortcuts.map((category) => (
                <div key={category.category} className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Command className="h-4 w-4 text-indigo-500" weight="bold" />
                    {category.category}
                  </h3>
                  <div className="space-y-2">
                    {category.shortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm text-muted-foreground">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, keyIndex) => (
                            <Badge
                              key={keyIndex}
                              variant="outline"
                              className="font-mono bg-background border-2"
                            >
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Swipe Gestures */}
          <Card className="border-2 hover:border-blue-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowsLeftRight className="h-5 w-5 text-blue-500" weight="fill" />
                Gestes tactiles (Mobile)
              </CardTitle>
              <CardDescription>
                Utilisez ces gestes sur mobile pour interagir rapidement avec vos emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {swipeActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-2xl">{action.icon}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">{action.gesture}</h4>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                  <Badge className="bg-blue-500 shrink-0">
                    {action.defaultAction}
                  </Badge>
                </div>
              ))}
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                  Les actions de swipe peuvent être personnalisées dans les Paramètres
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="border-2 border-dashed">
            <CardHeader>
              <CardTitle>Astuces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Les raccourcis clavier fonctionnent sur toutes les pages de l'application</p>
              <p>• Maintenez Shift pendant la navigation pour sélectionner plusieurs emails</p>
              <p>• Double-cliquez sur un email pour le marquer automatiquement comme lu et l'ouvrir</p>
              <p>• Les gestes de swipe sont disponibles uniquement sur les appareils tactiles</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
