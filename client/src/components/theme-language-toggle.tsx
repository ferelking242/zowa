import { Moon, Sun, Translate } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";

export function ThemeLanguageToggle() {
  const { theme, toggleTheme } = useTheme();
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="h-9 w-9"
        data-testid="button-theme-toggle"
      >
        {theme === "light" ? (
          <Moon className="h-5 w-5 text-foreground" weight="fill" />
        ) : (
          <Sun className="h-5 w-5 text-foreground" weight="fill" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            data-testid="button-language-toggle"
          >
            <Translate className="h-5 w-5 text-foreground" weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => changeLanguage("en")}
            className={i18n.language === "en" ? "bg-accent" : ""}
            data-testid="option-language-en"
          >
            🇬🇧 English
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => changeLanguage("fr")}
            className={i18n.language === "fr" ? "bg-accent" : ""}
            data-testid="option-language-fr"
          >
            🇫🇷 Français
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
