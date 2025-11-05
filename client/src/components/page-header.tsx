import { ArrowLeft } from "@phosphor-icons/react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  backTo?: string;
  iconGradient: string;
}

export function PageHeader({ icon, title, subtitle, backTo = "/", iconGradient }: PageHeaderProps) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center gap-3 sm:gap-4 mb-4">
        <Link href={backTo}>
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" weight="bold" />
          </Button>
        </Link>
        <div className={`w-12 h-12 sm:w-14 sm:h-14 ${iconGradient} rounded-2xl flex items-center justify-center shadow-lg shrink-0`}>
          {icon}
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
