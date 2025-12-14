'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Play, Loader2 } from 'lucide-react';
import { getApp } from '@/lib/api/apps';
import { getWorkflowDraft, saveWorkflowDraft, runWorkflow } from '@/lib/api/workflows';
import { WorkflowCanvas } from '@/components/workflow/canvas';
import { RunResultPanel } from '@/components/workflow/run-result-panel';
import { useWorkflowStore } from '@/lib/stores/workflow-store';

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;
  const { toast } = useToast();

  const { nodes, edges, setNodes, setEdges, isDirty, setDirty, reset } = useWorkflowStore();

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => getApp(appId),
    enabled: !!appId,
  });

  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['workflow', appId],
    queryFn: () => getWorkflowDraft(appId),
    enabled: !!appId,
  });

  useEffect(() => {
    if (workflow?.graph) {
      // Map API workflow nodes to local store format
      const mappedNodes = (workflow.graph.nodes || []).map((node) => ({
        id: node.id,
        type: node.type || 'unknown',
        position: node.position,
        data: {
          label: ((node.data as Record<string, unknown>)?.label as string) || node.type || 'Node',
          type: node.type || 'unknown',
          config: node.data,
        },
      }));
      setNodes(mappedNodes);
      setEdges(workflow.graph.edges || []);
      setDirty(false);
    }
  }, [workflow, setNodes, setEdges, setDirty]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Map local nodes back to API format
      const apiNodes = nodes.map((node) => ({
        id: node.id,
        type: node.type || 'unknown',
        position: node.position,
        data: (node.data.config || node.data) as Record<string, unknown>,
      }));
      return saveWorkflowDraft(appId, {
        graph: { nodes: apiNodes, edges },
      });
    },
    onSuccess: () => {
      setDirty(false);
      toast({ title: 'Workflow saved' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save workflow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => runWorkflow(appId, {}),
    onSuccess: (data) => {
      toast({
        title: 'Workflow started',
        description: `Run ID: ${data.workflow_run_id}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to run workflow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (appLoading || workflowLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[calc(100vh-200px)]" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Workflow not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b bg-background flex items-center gap-4 px-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/workflows')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">{app.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          <RunResultPanel appId={appId} />
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
          <Button
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run
          </Button>
        </div>
      </header>

      <div className="flex-1">
        <WorkflowCanvas />
      </div>
    </div>
  );
}
