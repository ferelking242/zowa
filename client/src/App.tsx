import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/use-settings";
import Home from "@/pages/home";
import Inbox from "@/pages/inbox";
import PlaywrightTest from "@/pages/playwright-test";
import Settings from "@/pages/settings";
import History from "@/pages/history";
import ApiDocs from "@/pages/api-docs";
import Help from "@/pages/help";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Account from "@/pages/account";
import AccountAutomation from "@/pages/account-automation";
import NotFound from "@/pages/not-found";
import "@/i18n/config";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/account" component={Account} />
      <Route path="/account-automation" component={AccountAutomation} />
      <Route path="/playwright-test" component={PlaywrightTest} />
      <Route path="/settings" component={Settings} />
      <Route path="/history" component={History} />
      <Route path="/api" component={ApiDocs} />
      <Route path="/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { settings } = useSettings();
  
  const toasterPosition = settings.notificationPosition === 'bottom' 
    ? 'bottom-right' 
    : 'top-right';
  
  return (
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster position={toasterPosition} />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
