import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { Code, Key, Envelope, CheckCircle, Database } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

export default function ApiDocs() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
        <PageHeader
          icon={<Code className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title={t('pages.apiDocs.title')}
          subtitle={t('pages.apiDocs.subtitle')}
          iconGradient="bg-gradient-to-br from-orange-400 to-orange-600"
        />
        <div className="space-y-6">
          {/* Overview */}
          <Card className="border-2 hover:border-orange-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-orange-500" weight="fill" />
                Vue d'ensemble
              </CardTitle>
              <CardDescription>
                API REST pour la gestion d'emails temporaires et validation automatique
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Base URL: <code className="px-3 py-1 bg-muted rounded-lg text-sm font-mono">/api</code>
                </p>
                <p className="text-sm text-muted-foreground">
                  Toutes les réponses sont au format JSON. Les endpoints nécessitant une authentification requièrent un token Bearer dans le header Authorization.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Authentication */}
          <Card className="border-2 hover:border-amber-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" weight="fill" />
                Authentification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Header requis:</p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto font-mono">
                  {`Authorization: Bearer YOUR_API_TOKEN`}
                </pre>
              </div>
              <div className="text-sm text-muted-foreground">
                Les tokens API sont générés depuis votre compte et doivent être gardés secrets.
              </div>
            </CardContent>
          </Card>

          {/* Endpoints - Emails */}
          <Card className="border-2 hover:border-blue-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Envelope className="h-5 w-5 text-blue-500" weight="fill" />
                Endpoints - Emails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* GET /api/email/:email */}
              <div className="space-y-2 pb-4 border-b">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500 text-white">GET</Badge>
                  <code className="text-sm font-mono">/api/email/:email</code>
                </div>
                <p className="text-sm text-muted-foreground">Récupère tous les messages pour une adresse email</p>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Exemple de réponse:</p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono">
{`[
  {
    "id": "msg_123",
    "fromAddress": "noreply@service.com",
    "toAddress": "test@antdev.org",
    "subject": "Verification Email",
    "textContent": "Click to verify...",
    "receivedAt": 1234567890
  }
]`}
                  </pre>
                </div>
              </div>

              {/* GET /api/inbox/:inboxId */}
              <div className="space-y-2 pb-4 border-b">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500 text-white">GET</Badge>
                  <code className="text-sm font-mono">/api/inbox/:inboxId</code>
                </div>
                <p className="text-sm text-muted-foreground">Récupère les détails d'un message spécifique</p>
              </div>

              {/* DELETE /api/message/:inboxId */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500 text-white">DELETE</Badge>
                  <code className="text-sm font-mono">/api/message/:inboxId</code>
                </div>
                <p className="text-sm text-muted-foreground">Supprime un message spécifique</p>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints - Validation */}
          <Card className="border-2 hover:border-green-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" weight="fill" />
                Endpoints - Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* POST /api/validate */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500 text-white">POST</Badge>
                  <code className="text-sm font-mono">/api/validate</code>
                </div>
                <p className="text-sm text-muted-foreground">Valide automatiquement un lien d'email</p>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Body:</p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono">
{`{
  "url": "https://example.com/verify?token=abc123",
  "method": "GET"
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card className="border-2 hover:border-purple-500/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-500" weight="fill" />
                Limites de taux
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• 100 requêtes par minute pour les endpoints de lecture</p>
              <p>• 20 requêtes par minute pour les endpoints de validation</p>
              <p>• Les limites sont appliquées par token API</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
