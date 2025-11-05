import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SiReplit } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Loader2, Play, CheckCircle, XCircle, AlertCircle, Bug, Clock, Mail, Trash2, RefreshCw, Eye, EyeOff, Maximize2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { AutomationTask } from '@shared/schema';

export default function AccountAutomation() {
  const { t } = useTranslation();
  const [selectedProvider, setSelectedProvider] = useState<'replit' | null>('replit');
  const [email, setEmail] = useState('username@antdev.org');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const debugLogsEndRef = useRef<HTMLDivElement>(null);

  const { data: debugModeData } = useQuery<{ debugMode: boolean }>({
    queryKey: ['/api/automation/debug'],
    refetchInterval: false,
  });

  const { data: tasksData } = useQuery<{ tasks: AutomationTask[] }>({
    queryKey: ['/api/automation/tasks'],
    refetchInterval: 2000,
  });

  const { data: currentTask } = useQuery<AutomationTask>({
    queryKey: ['/api/automation/task', currentTaskId],
    enabled: !!currentTaskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'running' || data?.status === 'pending') {
        return 1000;
      }
      return false;
    },
  });

  const startAutomation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await apiRequest('POST', '/api/automation/replit', data);
      return await response.json();
    },
    onSuccess: (data: { taskId: string }) => {
      setCurrentTaskId(data.taskId);
      queryClient.invalidateQueries({ queryKey: ['/api/automation/tasks'] });
    },
  });

  const toggleDebugMode = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('POST', '/api/automation/debug', { enabled });
      return await response.json();
    },
    onSuccess: (data: { debugMode: boolean }) => {
      setDebugMode(data.debugMode);
      queryClient.invalidateQueries({ queryKey: ['/api/automation/debug'] });
    },
  });

  useEffect(() => {
    if (debugModeData && debugMode !== debugModeData.debugMode) {
      setDebugMode(debugModeData.debugMode);
    }
  }, [debugModeData, debugMode]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentTask?.logs, autoScroll]);

  useEffect(() => {
    if (autoScroll && debugLogsEndRef.current) {
      debugLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentTask?.debugLogs, autoScroll]);

  const handleStart = () => {
    if (!email || !selectedProvider) return;
    startAutomation.mutate({ email });
  };

  const getStatusBadge = (status: AutomationTask['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" data-testid={`status-pending`} className="gap-1"><Clock className="h-3 w-3" />{t('automation.status.pending')}</Badge>;
      case 'running':
        return <Badge variant="default" data-testid={`status-running`} className="gap-1 bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" />{t('automation.status.running')}</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500 gap-1" data-testid={`status-completed`}><CheckCircle className="h-3 w-3" />{t('automation.status.completed')}</Badge>;
      case 'failed':
        return <Badge variant="destructive" data-testid={`status-failed`} className="gap-1"><XCircle className="h-3 w-3" />{t('automation.status.failed')}</Badge>;
    }
  };

  const getStepIcon = (status: 'pending' | 'running' | 'completed' | 'failed') => {
    switch (status) {
      case 'pending':
        return <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-8 w-8 flex items-center justify-center"><Clock className="h-4 w-4 text-gray-500" /></div>;
      case 'running':
        return <div className="rounded-full bg-blue-500 h-8 w-8 flex items-center justify-center"><Loader2 className="h-4 w-4 text-white animate-spin" /></div>;
      case 'completed':
        return <div className="rounded-full bg-green-500 h-8 w-8 flex items-center justify-center"><CheckCircle className="h-4 w-4 text-white" /></div>;
      case 'failed':
        return <div className="rounded-full bg-red-500 h-8 w-8 flex items-center justify-center"><XCircle className="h-4 w-4 text-white" /></div>;
    }
  };

  const getTaskProgress = (task: AutomationTask | undefined) => {
    if (!task || !task.steps.length) return 0;
    const completed = task.steps.filter(s => s.status === 'completed').length;
    return (completed / task.steps.length) * 100;
  };

  const formatLog = (log: string) => {
    if (log.includes('✅')) return <span className="text-green-600 dark:text-green-400">{log}</span>;
    if (log.includes('❌')) return <span className="text-red-600 dark:text-red-400">{log}</span>;
    if (log.includes('⚠️') || log.includes('🚨')) return <span className="text-orange-600 dark:text-orange-400">{log}</span>;
    if (log.includes('🔄') || log.includes('⏳')) return <span className="text-blue-600 dark:text-blue-400">{log}</span>;
    return <span>{log}</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2" data-testid="title-automation">
                <SiReplit className="h-7 w-7 text-primary" />
                {t('automation.title')}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm" data-testid="text-subtitle">{t('automation.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/50">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium hidden md:block">Debug</span>
                <Switch
                  checked={debugMode}
                  onCheckedChange={(checked) => toggleDebugMode.mutate(checked)}
                  data-testid="switch-debug-mode"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg" data-testid="title-provider">🚀 Configuration</CardTitle>
              <CardDescription data-testid="text-provider-desc">{t('automation.selectProviderDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant={selectedProvider === 'replit' ? 'default' : 'outline'}
                className="w-full justify-start h-14"
                onClick={() => setSelectedProvider('replit')}
                data-testid="button-select-replit"
              >
                <SiReplit className="h-6 w-6 mr-3" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Replit</div>
                  <div className="text-xs text-muted-foreground">Automatisation</div>
                </div>
              </Button>

              <Separator />

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2" data-testid="label-email">
                  <Mail className="h-4 w-4" />
                  {t('automation.email')}
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="username@antdev.org"
                  data-testid="input-email"
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleStart}
                disabled={!selectedProvider || !email || startAutomation.isPending || (currentTask?.status === 'running')}
                className="w-full h-12 text-base font-semibold"
                data-testid="button-start-automation"
              >
                {startAutomation.isPending || currentTask?.status === 'running' ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    En cours...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    {t('automation.startAutomation')}
                  </>
                )}
              </Button>

              {currentTask && (
                <>
                  <Separator />
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Statut</span>
                      {getStatusBadge(currentTask.status)}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progression</span>
                        <span>{Math.round(getTaskProgress(currentTask))}%</span>
                      </div>
                      <Progress value={getTaskProgress(currentTask)} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-muted/50">
                        <div className="text-muted-foreground">Email</div>
                        <div className="font-mono font-medium truncate">{currentTask.email}</div>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <div className="text-muted-foreground">Provider</div>
                        <div className="font-medium">{currentTask.provider}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg" data-testid="title-status">📊 Suivi en temps réel</CardTitle>
                  <CardDescription>Logs et progression de l'automatisation</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoScroll(!autoScroll)}
                  className="gap-2"
                >
                  {autoScroll ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Auto-scroll
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {currentTask ? (
                <Tabs defaultValue="steps" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="steps" className="text-xs md:text-sm">
                      Étapes ({currentTask.steps.length})
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="text-xs md:text-sm">
                      Logs ({currentTask.logs.length})
                    </TabsTrigger>
                    {debugMode && (
                      <TabsTrigger value="debug" className="text-xs md:text-sm">
                        Debug ({currentTask.debugLogs.length})
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="media" className="text-xs md:text-sm">
                      Captures ({currentTask.screenshots.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="steps" className="mt-4">
                    <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/20">
                      {currentTask.steps.length > 0 ? (
                        <div className="space-y-3">
                          {currentTask.steps.map((step, index) => (
                            <div key={step.id} className="flex gap-3" data-testid={`step-${step.id}`}>
                              <div className="flex flex-col items-center">
                                {getStepIcon(step.status)}
                                {index < currentTask.steps.length - 1 && (
                                  <div className="w-0.5 h-8 bg-border my-1"></div>
                                )}
                              </div>
                              <div className="flex-1 pb-3">
                                <div className="font-medium text-sm">{step.label}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          Aucune étape disponible
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="logs" className="mt-4">
                    <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-black/5 dark:bg-white/5">
                      {currentTask.logs.length > 0 ? (
                        <div className="space-y-1 font-mono text-xs">
                          {currentTask.logs.map((log, index) => (
                            <div key={index} className="hover:bg-muted/50 px-2 py-1 rounded" data-testid={`log-entry-${index}`}>
                              {formatLog(log)}
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          Aucun log disponible
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  {debugMode && (
                    <TabsContent value="debug" className="mt-4">
                      <ScrollArea className="h-[500px] w-full rounded-md border border-blue-500/30 p-4 bg-blue-500/5">
                        {currentTask.debugLogs.length > 0 ? (
                          <div className="space-y-1 font-mono text-xs">
                            {currentTask.debugLogs.map((log, index) => (
                              <div key={index} className="text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded" data-testid={`debug-log-entry-${index}`}>
                                {log}
                              </div>
                            ))}
                            <div ref={debugLogsEndRef} />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full text-blue-600/50">
                            Aucun log de debug disponible
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>
                  )}

                  <TabsContent value="media" className="mt-4">
                    <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                      {currentTask.screenshots.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {currentTask.screenshots.map((screenshot, index) => (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium" data-testid={`screenshot-label-${index}`}>
                                  📸 Capture {index + 1}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedScreenshot(expandedScreenshot === screenshot ? null : screenshot)}
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <img
                                src={screenshot}
                                alt={`Screenshot ${index + 1}`}
                                className="w-full rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                                data-testid={`screenshot-${index}`}
                                onClick={() => setExpandedScreenshot(screenshot)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          Aucune capture disponible
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium" data-testid="text-no-task">Aucune tâche active</p>
                  <p className="text-sm text-muted-foreground mt-2">Démarrez une automatisation pour voir les détails</p>
                </div>
              )}

              {currentTask && currentTask.errorMessages.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-destructive">🚨 Erreurs détectées</h3>
                  {currentTask.errorMessages.map((error, index) => (
                    <Alert variant="destructive" key={index} data-testid={`error-message-${index}`}>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {tasksData?.tasks && tasksData.tasks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg" data-testid="title-history">📜 Historique</CardTitle>
                  <CardDescription data-testid="text-history-desc">Les 10 dernières automatisations</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Actualiser
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {tasksData.tasks.slice(0, 10).map((task: AutomationTask) => (
                  <div
                    key={task.id}
                    className={`group p-3 border rounded-lg hover:border-primary hover:bg-accent/50 cursor-pointer transition-all ${
                      currentTaskId === task.id ? 'border-primary bg-accent' : ''
                    }`}
                    onClick={() => setCurrentTaskId(task.id)}
                    data-testid={`task-history-${task.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <SiReplit className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                      {getStatusBadge(task.status)}
                    </div>
                    <p className="text-sm font-medium truncate mb-1" data-testid={`task-email-${task.id}`}>
                      {task.email}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`task-date-${task.id}`}>
                      {new Date(task.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {expandedScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedScreenshot(null)}
        >
          <div className="max-w-6xl max-h-full">
            <img
              src={expandedScreenshot}
              alt="Expanded screenshot"
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
