import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleHeader } from "@/components/simple-header";
import { PageHeader } from "@/components/page-header";
import { User, Envelope, Calendar, SignOut } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Déconnexion réussie");
      setLocation("/login");
    } catch (error) {
      toast.error("Erreur lors de la déconnexion");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-3xl">
        <PageHeader
          icon={<User className="text-white text-2xl sm:text-3xl" weight="fill" />}
          title="Mon Compte"
          subtitle="Gérez vos informations personnelles"
          iconGradient="bg-gradient-to-br from-purple-400 to-purple-600"
        />

        <div className="space-y-6">
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Informations du compte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                <Envelope className="h-5 w-5 text-purple-500" weight="fill" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium truncate" data-testid="text-user-email">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                <User className="h-5 w-5 text-purple-500" weight="fill" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Nom d'utilisateur</p>
                  <p className="font-medium truncate" data-testid="text-user-username">{user.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-500" weight="fill" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Membre depuis</p>
                  <p className="font-medium" data-testid="text-user-created">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: fr })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-red-200 dark:border-red-900">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-400">Zone de danger</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <SignOut className="mr-2 h-4 w-4" weight="bold" />
                Se déconnecter
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
