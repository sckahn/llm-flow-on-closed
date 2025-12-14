'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { AppCard } from '@/components/apps/app-card';
import { CreateAppDialog } from '@/components/apps/create-app-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { getApps, createApp, copyApp } from '@/lib/api/apps';
import type { App, AppMode } from '@/types/api';
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

export default function AppsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteApp, setDeleteApp] = useState<App | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; mode: AppMode; description?: string }) =>
      createApp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      toast({ title: 'App created successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create app',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const copyMutation = useMutation({
    mutationFn: (id: string) => copyApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      toast({ title: 'App duplicated successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to duplicate app',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/console/api/apps/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      toast({ title: 'App deleted successfully' });
      setDeleteApp(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete app',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        onCreateClick={() => setCreateDialogOpen(true)}
        createLabel="Create App"
      />

      <div className="flex-1 p-6 overflow-auto">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load apps: {(error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {data && data.data.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <h3 className="text-lg font-semibold mb-2">No apps yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first app to get started
            </p>
          </div>
        )}

        {data && data.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onCopy={(app) => copyMutation.mutate(app.id)}
                onDelete={(app) => setDeleteApp(app)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateAppDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
      />

      <AlertDialog open={!!deleteApp} onOpenChange={() => setDeleteApp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete App</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteApp?.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteApp && deleteMutation.mutate(deleteApp.id)}
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
