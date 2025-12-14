'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  MessageSquare,
  Settings,
  Play,
  Save,
  Loader2,
  FileText,
} from 'lucide-react';
import { getApp, getAppConfig, updateAppConfig } from '@/lib/api/apps';
import { ChatWindow } from '@/components/chat/chat-window';
import { PromptEditor } from '@/components/apps/prompt-editor';
import { ModelSelector } from '@/components/apps/model-selector';
import { VariableSettings } from '@/components/apps/variable-settings';
import { KnowledgeBaseConfig } from '@/components/apps/knowledge-base-config';
import type { AppConfig, AppModelConfig, InputVariable, DatasetConfig } from '@/types/api';

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for app config
  const [promptType, setPromptType] = useState<'simple' | 'advanced'>('simple');
  const [prePrompt, setPrePrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'system' | 'user' | 'assistant'; text: string }>>([]);
  const [modelConfig, setModelConfig] = useState<AppModelConfig | undefined>();
  const [variables, setVariables] = useState<InputVariable[]>([]);
  const [datasetConfigs, setDatasetConfigs] = useState<DatasetConfig[]>([]);
  const [openingStatement, setOpeningStatement] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const { data: app, isLoading, error } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => getApp(appId),
    enabled: !!appId,
  });

  const { data: appConfig, isLoading: configLoading } = useQuery({
    queryKey: ['app-config', appId],
    queryFn: () => getAppConfig(appId),
    enabled: !!appId,
  });

  // Initialize local state from fetched config
  useEffect(() => {
    if (appConfig) {
      setPromptType(appConfig.prompt_type || 'simple');
      setPrePrompt(appConfig.pre_prompt || '');
      setMessages(appConfig.chat_prompt_config?.messages || []);
      setModelConfig(appConfig.model);
      setVariables(appConfig.user_input_form || []);
      setDatasetConfigs(appConfig.dataset_configs || []);
      setOpeningStatement(appConfig.opening_statement || '');
      setIsDirty(false);
    }
  }, [appConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const config: Partial<AppConfig> = {
        prompt_type: promptType,
        pre_prompt: promptType === 'simple' ? prePrompt : undefined,
        chat_prompt_config: promptType === 'advanced' ? { messages } : undefined,
        model: modelConfig,
        user_input_form: variables,
        dataset_configs: datasetConfigs,
        opening_statement: openingStatement,
      };
      await updateAppConfig(appId, config);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['app-config', appId] });
      toast({ title: 'Configuration saved' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePromptChange = (data: {
    promptType: 'simple' | 'advanced';
    prePrompt?: string;
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; text: string }>;
  }) => {
    setPromptType(data.promptType);
    if (data.prePrompt !== undefined) setPrePrompt(data.prePrompt);
    if (data.messages !== undefined) setMessages(data.messages);
    setIsDirty(true);
  };

  const handleModelChange = (config: AppModelConfig) => {
    setModelConfig(config);
    setIsDirty(true);
  };

  const handleVariablesChange = (vars: InputVariable[]) => {
    setVariables(vars);
    setIsDirty(true);
  };

  const handleDatasetsChange = (configs: DatasetConfig[]) => {
    setDatasetConfigs(configs);
    setIsDirty(true);
  };

  if (isLoading || configLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load app: {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>App not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const variableNames = variables.map((v) => v.variable);

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 border-b bg-background flex items-center gap-4 px-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/apps')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: app.icon_background || '#6366f1' }}
          >
            {app.icon ? (
              <span className="text-xl">{app.icon}</span>
            ) : (
              <MessageSquare className="h-5 w-5 text-white" />
            )}
          </div>
          <div>
            <h1 className="font-semibold">{app.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">{app.mode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </header>

      <Tabs defaultValue="orchestrate" className="flex-1 flex flex-col">
        <div className="border-b px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-6">
            <TabsTrigger
              value="orchestrate"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0"
            >
              <Settings className="h-4 w-4 mr-2" />
              Orchestrate
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0"
            >
              <Play className="h-4 w-4 mr-2" />
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="publish"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0"
            >
              <FileText className="h-4 w-4 mr-2" />
              Publish
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="orchestrate" className="flex-1 m-0 overflow-auto">
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Prompt & Model */}
              <div className="space-y-6">
                <PromptEditor
                  promptType={promptType}
                  prePrompt={prePrompt}
                  messages={messages}
                  variables={variableNames}
                  onChange={handlePromptChange}
                />
                <ModelSelector config={modelConfig} onChange={handleModelChange} />
              </div>

              {/* Right Column - Variables & Knowledge */}
              <div className="space-y-6">
                <VariableSettings
                  variables={variables}
                  onChange={handleVariablesChange}
                />
                <KnowledgeBaseConfig
                  configs={datasetConfigs}
                  onChange={handleDatasetsChange}
                />

                {/* Opening Statement */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Opening Statement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={openingStatement}
                      onChange={(e) => {
                        setOpeningStatement(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="Enter a welcome message for users..."
                      className="min-h-[100px]"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
          <ChatWindow appId={appId} appMode={app.mode} />
        </TabsContent>

        <TabsContent value="publish" className="flex-1 m-0 p-6 overflow-auto">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>App Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={app.name} readOnly />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea
                    value={app.description || ''}
                    placeholder="No description"
                    readOnly
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Mode</Label>
                  <Input value={app.mode} readOnly className="capitalize" />
                </div>
                <div className="grid gap-2">
                  <Label>Created</Label>
                  <Input value={new Date(app.created_at).toLocaleString()} readOnly />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>API Endpoint</Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${process.env.NEXT_PUBLIC_API_URL || ''}/v1/chat-messages`}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${process.env.NEXT_PUBLIC_API_URL || ''}/v1/chat-messages`
                        );
                        toast({ title: 'Copied to clipboard' });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use your API key to authenticate requests. Create API keys in the API Keys section.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
