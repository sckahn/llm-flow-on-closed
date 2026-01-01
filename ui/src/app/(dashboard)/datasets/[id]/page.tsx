'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Network,
  Download,
  FolderUp,
  RefreshCw,
} from 'lucide-react';
import { getDataset, getDocuments, uploadDocument, deleteDocument, retryDocumentIndexing, getDocumentProgress } from '@/lib/api/datasets';
import { graphragApi, type BuildGraphRAGProgress } from '@/lib/api/graphrag';
import type { Document } from '@/types/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  waiting: <Clock className="h-4 w-4 text-yellow-500" />,
  parsing: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  splitting: <Loader2 className="h-4 w-4 text-purple-500 animate-spin" />,
  indexing: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  paused: <Clock className="h-4 w-4 text-orange-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
};

// Progress component for document indexing with real-time updates
function DocumentProgress({ doc, datasetId }: { doc: Document; datasetId: string }) {
  const isProcessing = doc.indexing_status === 'parsing' || doc.indexing_status === 'indexing';

  // Poll progress API for processing documents
  const { data: progressData } = useQuery({
    queryKey: ['document-progress', datasetId, doc.id],
    queryFn: () => getDocumentProgress(datasetId, doc.id),
    enabled: isProcessing,
    refetchInterval: isProcessing ? 1000 : false, // Poll every second while processing
    retry: false,
  });

  const getProgress = () => {
    // Use real-time progress if available
    if (progressData && progressData.progress > 0) {
      return progressData.progress;
    }

    // Fallback to segment-based progress
    switch (doc.indexing_status) {
      case 'completed':
        return 100;
      case 'indexing':
        if (doc.completed_segments && doc.total_segments) {
          return Math.round((doc.completed_segments / doc.total_segments) * 100);
        }
        return 75;
      case 'parsing':
        return 50;
      case 'waiting':
      case 'paused':
        return 0;
      case 'error':
        return 0;
      default:
        return 0;
    }
  };

  const progress = getProgress();
  const message = progressData?.message || '';

  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          {isProcessing ? (
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          ) : doc.indexing_status === 'error' ? (
            <div className="h-full bg-red-500 rounded-full w-full" />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                doc.indexing_status === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/30'
              }`}
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground w-10 text-right">
          {doc.indexing_status === 'error' ? 'Error' : `${progress}%`}
        </span>
      </div>
      {message && isProcessing && (
        <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={message}>
          {message}
        </span>
      )}
    </div>
  );
}

export default function DatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const datasetId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildGraphRAGProgress>({
    dataset_id: '',
    status: 'idle',
    total_documents: 0,
    completed_documents: 0,
    total_segments: 0,
    completed_segments: 0,
    current_document: '',
    entities_extracted: 0,
    relationships_extracted: 0,
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: dataset, isLoading: datasetLoading } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId),
    enabled: !!datasetId,
  });

  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ['documents', datasetId],
    queryFn: () => getDocuments(datasetId),
    enabled: !!datasetId,
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.data?.some(
        (doc) => doc.indexing_status === 'parsing' || doc.indexing_status === 'indexing'
      );
      return hasProcessing ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(datasetId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
      toast({ title: 'Document deleted successfully' });
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete document',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (docId: string) => retryDocumentIndexing(datasetId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', datasetId] });
      toast({ title: 'Retry started' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to retry',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // GraphRAG stats query
  const { data: graphragStats, refetch: refetchGraphragStats } = useQuery({
    queryKey: ['graphrag-stats', datasetId],
    queryFn: () => graphragApi.getStats(datasetId),
    enabled: !!datasetId,
    retry: false,
  });

  // Check and restore build progress on page load
  useEffect(() => {
    const checkProgress = async () => {
      try {
        const progress = await graphragApi.getBuildProgress(datasetId);
        if (progress.status === 'building') {
          setBuildProgress(progress);
        }
      } catch (error) {
        console.error('Failed to check build progress:', error);
      }
    };
    checkProgress();
  }, [datasetId]);

  // Poll build progress when building
  useEffect(() => {
    if (buildProgress.status !== 'building') return;

    const pollInterval = setInterval(async () => {
      try {
        const progress = await graphragApi.getBuildProgress(datasetId);
        setBuildProgress(progress);

        if (progress.status === 'completed') {
          refetchGraphragStats();
          toast({
            title: 'GraphRAG Build Complete',
            description: `Extracted ${progress.entities_extracted} entities and ${progress.relationships_extracted} relationships.`,
          });
        } else if (progress.status === 'error') {
          toast({
            title: 'Build Failed',
            description: progress.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Failed to poll build progress:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [buildProgress.status, datasetId, toast, refetchGraphragStats]);

  // Build GraphRAG function - calls backend API (no browser memory usage)
  const handleBuildGraphRAG = useCallback(async () => {
    if (!documents?.data || documents.data.length === 0) {
      toast({
        title: 'No documents',
        description: 'Upload documents first before building GraphRAG index.',
        variant: 'destructive',
      });
      return;
    }

    const completedDocs = documents.data.filter(
      (doc) => doc.indexing_status === 'completed'
    );

    if (completedDocs.length === 0) {
      toast({
        title: 'No indexed documents',
        description: 'Wait for documents to finish indexing first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Start build on backend - no data loaded in browser!
      await graphragApi.startBuild({ dataset_id: datasetId });

      setBuildProgress({
        dataset_id: datasetId,
        status: 'building',
        total_documents: completedDocs.length,
        completed_documents: 0,
        total_segments: 0,
        completed_segments: 0,
        current_document: 'Starting build...',
        entities_extracted: 0,
        relationships_extracted: 0,
      });

      toast({
        title: 'Build Started',
        description: 'GraphRAG index is building in background. This page will update automatically.',
      });
    } catch (error) {
      toast({
        title: 'Failed to start build',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  }, [documents, datasetId, toast]);

  // Export GraphRAG data
  const handleExportGraphRAG = useCallback(async () => {
    if (!graphragStats) {
      toast({
        title: 'No GraphRAG data',
        description: 'Build GraphRAG index first before exporting.',
        variant: 'destructive',
      });
      return;
    }

    setExporting(true);
    try {
      const blob = await graphragApi.exportDataset(datasetId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `graphrag_${datasetId}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export successful' });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [datasetId, graphragStats, toast]);

  // Import GraphRAG data
  const handleImportGraphRAG = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const result = await graphragApi.importDataset(file, datasetId, false);
        toast({
          title: 'Import successful',
          description: result.message,
        });
        refetchGraphragStats();
      } catch (error) {
        toast({
          title: 'Import failed',
          description: (error as Error).message,
          variant: 'destructive',
        });
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    },
    [datasetId, toast, refetchGraphragStats]
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setUploading(true);

      for (const file of Array.from(files)) {
        try {
          await uploadDocument(datasetId, file);
          toast({ title: `Uploaded ${file.name}` });
        } catch (error) {
          toast({
            title: `Failed to upload ${file.name}`,
            description: (error as Error).message,
            variant: 'destructive',
          });
        }
      }

      setUploading(false);
      queryClient.invalidateQueries({ queryKey: ['documents', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
      e.target.value = '';
    },
    [datasetId, queryClient, toast]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setUploading(true);

      for (const file of files) {
        try {
          await uploadDocument(datasetId, file);
          toast({ title: `Uploaded ${file.name}` });
        } catch (error) {
          toast({
            title: `Failed to upload ${file.name}`,
            description: (error as Error).message,
            variant: 'destructive',
          });
        }
      }

      setUploading(false);
      queryClient.invalidateQueries({ queryKey: ['documents', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
    },
    [datasetId, queryClient, toast]
  );

  if (datasetLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Dataset not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 border-b bg-background flex items-center gap-4 px-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/datasets')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold">{dataset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {dataset.document_count ?? 0} documents, {(dataset.word_count ?? 0).toLocaleString()} words
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleBuildGraphRAG}
          disabled={buildProgress.status === 'building' || !documents?.data?.length}
        >
          {buildProgress.status === 'building' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Network className="h-4 w-4 mr-2" />
          )}
          Build GraphRAG
        </Button>
        <label>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.md,.docx,.doc,.csv"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <Button asChild disabled={uploading}>
            <span>
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Files
            </span>
          </Button>
        </label>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        {/* GraphRAG Status Card */}
        {(graphragStats || buildProgress.status !== 'idle') && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4" />
                GraphRAG Index
              </CardTitle>
            </CardHeader>
            <CardContent>
              {buildProgress.status === 'building' && (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="truncate flex-1">{buildProgress.current_document || 'Starting...'}</span>
                    <span className="ml-2 whitespace-nowrap">
                      {buildProgress.completed_segments} / {buildProgress.total_segments || '?'}
                    </span>
                  </div>
                  <Progress
                    value={buildProgress.total_segments > 0
                      ? (buildProgress.completed_segments / buildProgress.total_segments) * 100
                      : 0
                    }
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Documents: {buildProgress.completed_documents}/{buildProgress.total_documents}</span>
                    <span>Entities: {buildProgress.entities_extracted} | Relations: {buildProgress.relationships_extracted}</span>
                  </div>
                </div>
              )}
              {buildProgress.status === 'completed' && !graphragStats && (
                <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
                  <CheckCircle className="h-4 w-4" />
                  Build completed! Refreshing stats...
                </div>
              )}
              {graphragStats && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {graphragStats.graph?.entity_count ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Entities</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {graphragStats.graph?.relationship_count ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Relationships</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {((graphragStats.vector as { total_entities?: number; count?: number })?.total_entities ?? (graphragStats.vector as { count?: number })?.count ?? 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">Vectors</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => router.push(`/knowledge-graph?dataset=${datasetId}`)}
                    >
                      <Network className="h-4 w-4 mr-2" />
                      View Graph
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleExportGraphRAG}
                      disabled={exporting}
                    >
                      {exporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <label>
                      <input
                        type="file"
                        className="hidden"
                        accept=".json"
                        onChange={handleImportGraphRAG}
                        disabled={importing}
                      />
                      <Button asChild variant="outline" disabled={importing}>
                        <span>
                          {importing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FolderUp className="h-4 w-4" />
                          )}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              )}
              {!graphragStats && buildProgress.status === 'idle' && (
                <p className="text-sm text-muted-foreground">
                  No GraphRAG index yet. Click &quot;Build GraphRAG&quot; to create one.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div
          className="border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-colors hover:border-primary/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here, or click Upload Files above
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports PDF, TXT, MD, DOCX, CSV
          </p>
        </div>

        {documentsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : documents?.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No documents yet. Upload files to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Words</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents?.data.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcons[doc.indexing_status]}
                      <Badge
                        variant={
                          doc.indexing_status === 'completed'
                            ? 'default'
                            : doc.indexing_status === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {doc.indexing_status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DocumentProgress doc={doc} datasetId={datasetId} />
                  </TableCell>
                  <TableCell>{(doc.word_count ?? 0).toLocaleString()}</TableCell>
                  <TableCell>
                    {new Date(doc.created_at * 1000).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(doc.indexing_status === 'waiting' || doc.indexing_status === 'error') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => retryMutation.mutate(doc.id)}
                          disabled={retryMutation.isPending}
                          title="Retry indexing"
                        >
                          <RefreshCw className={`h-4 w-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
