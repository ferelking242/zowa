import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  List, 
  House, 
  Tray,
  User, 
  Gear, 
  ClockCounterClockwise, 
  PlayCircle, 
  Code, 
  Question,
  X,
  Robot
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: any;
}

const navItems: NavItem[] = [
  { label: "Accueil", href: "/", icon: House },
  { label: "Boîte de réception", href: "/inbox", icon: Tray },
  { label: "Compte", href: "/account", icon: User },
  { label: "Automatisation", href: "/account-automation", icon: Robot },
  { label: "Paramètres", href: "/settings", icon: Gear },
  { label: "Historique", href: "/history", icon: ClockCounterClockwise },
  { label: "Test Playwright", href: "/playwright-test", icon: PlayCircle },
  { label: "API", href: "/api", icon: Code },
  { label: "Aide", href: "/help", icon: Question },
];

export function NavigationMenu() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        data-testid="button-menu-toggle"
      >
        <List className="h-6 w-6 text-foreground" weight="bold" />
      </Button>

      {open && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setOpen(false)}
          />
          
          <div className="fixed left-0 top-0 bottom-0 w-64 bg-card shadow-2xl z-50 animate-in slide-in-from-left duration-150">
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <h2 className="text-lg font-bold">Menu</h2>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-md font-medium transition-all",
                        isActive 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "hover:bg-accent/80 text-foreground/90 hover:text-foreground"
                      )}
                      onClick={() => setOpen(false)}
                      data-testid={`nav-link-${item.href.slice(1) || 'home'}`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" weight={isActive ? "fill" : "regular"} />
                      <span>{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
