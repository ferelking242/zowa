import { ThemeLanguageToggle } from "@/components/theme-language-toggle";
import { NavigationMenu } from "@/components/navigation-menu";

export function SimpleHeader() {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <NavigationMenu />
          <ThemeLanguageToggle />
        </div>
      </div>
    </header>
  );
}
