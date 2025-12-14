'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  History,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  PlayCircle,
  AlertCircle,
} from 'lucide-react';
import { getWorkflowRunHistory } from '@/lib/api/workflows';

interface WorkflowRun {
  id: string;
  status: string;
  created_at: number;
  elapsed_time: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  steps?: Array<{
    node_id: string;
    node_type: string;
    title: string;
    status: string;
    elapsed_time: number;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;
  }>;
}

interface RunResultPanelProps {
  appId: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  succeeded: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  stopped: <AlertCircle className="h-4 w-4 text-yellow-500" />,
};

const statusColors: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  stopped: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export function RunResultPanel({ appId }: RunResultPanelProps) {
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['workflow-runs', appId],
    queryFn: () => getWorkflowRunHistory(appId),
    refetchInterval: 5000,
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          Run History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Workflow Run History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : runs?.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No runs yet</p>
              <p className="text-sm">Run the workflow to see results here</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-150px)]">
              <div className="space-y-3 pr-4">
                {runs?.data?.map((run) => (
                  <RunItem
                    key={run.id}
                    run={run}
                    isSelected={selectedRun?.id === run.id}
                    onClick={() => setSelectedRun(run.id === selectedRun?.id ? null : run as unknown as WorkflowRun)}
                    formatDuration={formatDuration}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RunItem({
  run,
  isSelected,
  onClick,
  formatDuration,
  formatTime,
}: {
  run: {
    id: string;
    status: string;
    created_at: number;
    elapsed_time: number;
  };
  isSelected: boolean;
  onClick: () => void;
  formatDuration: (ms: number) => string;
  formatTime: (timestamp: number) => string;
}) {
  return (
    <Collapsible open={isSelected} onOpenChange={onClick}>
      <div className="border rounded-lg overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors">
            {statusIcons[run.status] || <Clock className="h-4 w-4" />}
            <div className="flex-1 text-left">
              <div className="font-medium text-sm">Run #{run.id.slice(0, 8)}</div>
              <div className="text-xs text-muted-foreground">
                {formatTime(run.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusColors[run.status] || 'bg-gray-100'}>
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDuration(run.elapsed_time)}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isSelected ? 'rotate-180' : ''}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="p-3 bg-muted/30 space-y-3">
            <div>
              <div className="text-xs font-medium mb-1">Run ID</div>
              <code className="text-xs bg-muted px-2 py-1 rounded">{run.id}</code>
            </div>
            <div>
              <div className="text-xs font-medium mb-1">Duration</div>
              <span className="text-sm">{formatDuration(run.elapsed_time)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Click to view detailed trace in the Logs page
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Node execution visualization for the canvas
export function NodeExecutionOverlay({
  status,
  elapsedTime,
}: {
  status: 'running' | 'succeeded' | 'failed';
  elapsedTime?: number;
}) {
  return (
    <div
      className={`absolute -top-2 -right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
        status === 'running'
          ? 'bg-blue-500 text-white'
          : status === 'succeeded'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      {status === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : status === 'succeeded' ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {elapsedTime && <span>{(elapsedTime / 1000).toFixed(1)}s</span>}
    </div>
  );
}
