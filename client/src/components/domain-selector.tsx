import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { getAllDomains } from "@shared/email-providers";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface DomainSelectorProps {
  selectedDomain: string;
  onDomainChange: (domain: string) => void;
}

export function DomainSelector({ selectedDomain, onDomainChange }: DomainSelectorProps) {
  const domains = getAllDomains();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-y border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Scrolling domains banner */}
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2 animate-marquee">
                {domains.map((domain, index) => (
                  <button
                    key={`${domain}-${index}`}
                    onClick={() => {
                      onDomainChange(domain);
                      setIsOpen(false);
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      selectedDomain === domain
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    data-testid={`button-domain-${domain}`}
                  >
                    @{domain}
                  </button>
                ))}
                {/* Duplicate for seamless loop */}
                {domains.map((domain, index) => (
                  <button
                    key={`${domain}-dup-${index}`}
                    onClick={() => {
                      onDomainChange(domain);
                      setIsOpen(false);
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      selectedDomain === domain
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    data-testid={`button-domain-dup-${domain}`}
                  >
                    @{domain}
                  </button>
                ))}
              </div>
            </div>

            {/* Collapsible trigger */}
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 shrink-0"
                data-testid="button-domain-dropdown"
              >
                @{selectedDomain}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>

          {/* Collapsible content */}
          <CollapsibleContent className="mt-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-3 bg-card rounded-lg border border-border shadow-lg">
              {domains.map((domain) => (
                <button
                  key={domain}
                  onClick={() => {
                    onDomainChange(domain);
                    setIsOpen(false);
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    selectedDomain === domain
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  data-testid={`collapsible-item-${domain}`}
                >
                  @{domain}
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
