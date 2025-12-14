'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { getDataset, getDocuments, uploadDocument, deleteDocument } from '@/lib/api/datasets';
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
  indexing: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export default function DatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const datasetId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);

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
            {dataset.document_count} documents, {dataset.word_count.toLocaleString()} words
          </p>
        </div>
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
                <TableHead>Words</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
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
                  <TableCell>{doc.word_count.toLocaleString()}</TableCell>
                  <TableCell>
                    {new Date(doc.created_at * 1000).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
