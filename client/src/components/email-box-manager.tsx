import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Trash2, Copy } from "lucide-react";
import { useEmailBoxes } from "@/hooks/use-email-boxes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";

interface EmailBoxManagerProps {
  selectedDomain: string;
  onSelectBox?: (email: string) => void;
}

export function EmailBoxManager({ selectedDomain, onSelectBox }: EmailBoxManagerProps) {
  const { t } = useTranslation();
  const { emailBoxes, createEmailBox, createBoxWithRandomPrefix, deleteEmailBox } = useEmailBoxes();
  const [customPrefix, setCustomPrefix] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const handleCreateRandom = () => {
    const newBox = createBoxWithRandomPrefix(selectedDomain);
    toast.success("Boîte email créée", {
      description: newBox.fullEmail,
    });
  };

  const handleCreateCustom = () => {
    if (!customPrefix.trim()) return;
    
    if (customPrefix.length > 10) {
      toast.error("Préfixe trop long", {
        description: "Le préfixe doit faire maximum 10 caractères",
      });
      return;
    }

    const newBox = createEmailBox(customPrefix.trim(), selectedDomain);
    toast.success("Boîte email créée", {
      description: newBox.fullEmail,
    });
    setCustomPrefix("");
    setIsAddingCustom(false);
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success("Email copié", {
      description: email,
    });
  };

  const handleDelete = (id: string) => {
    deleteEmailBox(id);
    toast.success("Boîte email supprimée");
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Boîtes Email Personnalisées
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {emailBoxes.length} boîte{emailBoxes.length > 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Boutons de création */}
        <div className="space-y-2">
          <Button
            onClick={handleCreateRandom}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="button-create-random-box"
          >
            <Plus className="w-4 h-4 mr-2" />
            Générer une boîte (4 lettres aléatoires)
          </Button>

          {isAddingCustom ? (
            <div className="flex gap-2">
              <Input
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value.toUpperCase())}
                placeholder="Ex: WABOT"
                className="flex-1"
                maxLength={10}
                data-testid="input-custom-box-prefix"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateCustom()}
              />
              <Button
                onClick={handleCreateCustom}
                disabled={!customPrefix.trim()}
                data-testid="button-confirm-custom-box"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => {
                  setIsAddingCustom(false);
                  setCustomPrefix("");
                }}
                variant="outline"
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setIsAddingCustom(true)}
              variant="outline"
              className="w-full"
              data-testid="button-add-custom-box"
            >
              <Plus className="w-4 h-4 mr-2" />
              Créer avec un préfixe personnalisé
            </Button>
          )}
        </div>

        {/* Liste des boîtes */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {emailBoxes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Aucune boîte email créée</p>
              <p className="text-xs mt-1">Créez votre première boîte ci-dessus</p>
            </div>
          ) : (
            emailBoxes.map((box) => (
              <div
                key={box.id}
                className="bg-muted rounded-lg p-3 flex items-center justify-between gap-2 hover:bg-muted/80 transition-colors border border-border/50"
                data-testid={`box-item-${box.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs font-mono">
                      {box.prefix}
                    </Badge>
                    <span className="text-xs text-muted-foreground">#{box.number}</span>
                  </div>
                  <p className="font-mono text-sm truncate text-foreground">
                    {box.fullEmail}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopyEmail(box.fullEmail)}
                    data-testid={`button-copy-box-${box.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectBox?.(box.fullEmail)}
                    className="text-blue-500 hover:text-blue-600"
                    data-testid={`button-select-box-${box.id}`}
                  >
                    <Mail className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(box.id)}
                    className="text-destructive hover:text-destructive/90"
                    data-testid={`button-delete-box-${box.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Lien vers inbox complète */}
        {emailBoxes.length > 0 && (
          <div className="pt-4 border-t border-border">
            <Link href="/inbox">
              <Button variant="outline" className="w-full" data-testid="button-view-all-inbox">
                <Mail className="w-4 h-4 mr-2" />
                Voir toutes les boîtes dans l'inbox
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
