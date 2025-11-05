import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { Play, CheckCircle, XCircle, CircleNotch } from "@phosphor-icons/react";
import { apiRequest } from "@/lib/queryClient";

export default function PlaywrightTest() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    url: string;
    message: string;
    timestamp: string;
    finalUrl?: string;
    pageTitle?: string;
    pageText?: string;
    screenshot?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!url.trim()) {
      setError("Veuillez entrer une URL valide");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiRequest("POST", "/api/test-playwright", { url });
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erreur lors du test Playwright");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
        <PageHeader
          icon={<Play className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title="Test Playwright"
          subtitle="Vérification de validation d'email avec browser automation"
          iconGradient="bg-gradient-to-br from-cyan-400 to-cyan-600"
        />

        <Card className="border-2 hover:border-cyan-500/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-cyan-500" weight="fill" />
              Configuration du test
            </CardTitle>
            <CardDescription>
              Playwright va ouvrir le lien dans un navigateur headless avec mode stealth activé
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL de validation</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/verify?token=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleTest();
                  }
                }}
                data-testid="input-test-url"
              />
            </div>

            <Button
              onClick={handleTest}
              disabled={isLoading || !url.trim()}
              className="w-full gap-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700"
              data-testid="button-test-playwright"
            >
              {isLoading ? (
                <>
                  <CircleNotch className="h-4 w-4 animate-spin" weight="bold" />
                  Test en cours...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" weight="fill" />
                  Lancer le test
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mt-6">
            <XCircle className="h-4 w-4" weight="fill" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <Card className={`mt-6 border-2 ${result.success ? 'border-green-500/50' : 'border-red-500/50'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" weight="fill" />
                    <span className="text-green-600 dark:text-green-400">Test réussi</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" weight="fill" />
                    <span className="text-red-600 dark:text-red-400">Test échoué</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Message:</p>
                <p className="text-sm text-muted-foreground">{result.message}</p>
              </div>

              {result.finalUrl && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">URL finale:</p>
                  <code className="block text-xs bg-muted p-2 rounded font-mono break-all">
                    {result.finalUrl}
                  </code>
                </div>
              )}

              {result.pageTitle && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Titre de la page:</p>
                  <p className="text-sm text-muted-foreground">{result.pageTitle}</p>
                </div>
              )}

              {result.pageText && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Contenu de la page:</p>
                  <pre className="text-xs bg-muted p-3 rounded max-h-40 overflow-y-auto">
                    {result.pageText}
                  </pre>
                </div>
              )}

              {result.screenshot && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Screenshot:</p>
                  <img
                    src={`data:image/png;base64,${result.screenshot}`}
                    alt="Screenshot"
                    className="rounded border border-border max-w-full"
                  />
                </div>
              )}

              <div className="text-xs text-muted-foreground pt-2 border-t">
                Timestamp: {new Date(result.timestamp).toLocaleString('fr-FR')}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
