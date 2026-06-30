import { EmailGenerator } from "@/components/email-generator";
import { InboxList } from "@/components/inbox-list";
import { useEmail } from "@/hooks/use-email";
import { SimpleHeader } from "@/components/simple-header";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { getAllDomains } from "@shared/email-providers";

export default function Home() {
  const {
    currentEmail,
    messages,
    isLoading,
    systemStatus,
    isPolling,
    pollingInterval,
    lastRefresh,
    loadTime,
    copyEmail,
    generateNewEmail,
    setCustomEmail,
    clearInbox,
    refreshInbox,
    deleteMessage,
    isDeleting,
  } = useEmail();

  const { t } = useTranslation();

  const selectedDomain = currentEmail.split('@')[1] || getAllDomains()[0];

  const handleDomainChange = (domain: string | any) => {
    // Ensure domain is always a string
    const domainStr = typeof domain === 'string' ? domain : String(domain);
    generateNewEmail(domainStr);
  };

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />
              
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="mb-8 sm:mb-10 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-4 sm:mb-6 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-muted-foreground text-lg sm:text-xl md:text-2xl max-w-3xl mx-auto">
            {t('hero.description')}
          </p>
        </div>

        {/* Main Grid Layout */}
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-1">
            <EmailGenerator
              currentEmail={currentEmail}
              messages={messages}
              systemStatus={systemStatus}
              onCopyEmail={copyEmail}
              onGenerateNew={generateNewEmail}
              onSetCustomEmail={setCustomEmail}
              onClearInbox={clearInbox}
              isPolling={isPolling}
              pollingInterval={pollingInterval}
              selectedDomain={selectedDomain}
              onDomainChange={handleDomainChange}
            />
          </div>
          
          <div className="lg:col-span-2">
            <InboxList
              messages={messages}
              isLoading={isLoading}
              onRefresh={refreshInbox}
              onDeleteMessage={deleteMessage}
              isDeleting={isDeleting}
              systemStatus={systemStatus}
              lastRefresh={lastRefresh}
              loadTime={loadTime}
            />
          </div>
        </div>

      </main>
    </div>
  );
}
