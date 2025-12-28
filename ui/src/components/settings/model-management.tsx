'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Download,
  Trash2,
  Check,
  HardDrive,
  Cpu,
  RefreshCw
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Model {
  id: string;
  name: string;
  size: string;
  status: 'ready' | 'downloading' | 'error';
  progress?: number;
  isActive?: boolean;
}

// Recommended models
const RECOMMENDED_MODELS = [
  {
    id: 'LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct',
    name: 'EXAONE 3.5 7.8B',
    description: 'LG AI 한국어 특화 모델',
    size: '~15GB',
    vram: '16GB'
  },
  {
    id: 'LGAI-EXAONE/EXAONE-3.5-2.4B-Instruct',
    name: 'EXAONE 3.5 2.4B',
    description: 'LG AI 경량 한국어 모델',
    size: '~5GB',
    vram: '6GB'
  },
  {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    name: 'Qwen 2.5 7B',
    description: 'Alibaba 다국어 모델',
    size: '~15GB',
    vram: '16GB'
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'Mistral 7B',
    description: 'Mistral AI 범용 모델',
    size: '~15GB',
    vram: '16GB'
  },
];

export function ModelManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hfRepoUrl, setHfRepoUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Fetch installed models
  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error('Failed to fetch models');
      return response.json() as Promise<{ models: Model[], active_model?: string }>;
    },
    refetchInterval: 5000, // Refresh every 5 seconds to check download progress
  });

  // Check vLLM status
  const { data: vllmStatus, isLoading: vllmLoading } = useQuery({
    queryKey: ['vllm-status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/models/status');
        if (!response.ok) return { status: 'offline', model: null };
        return response.json();
      } catch {
        return { status: 'offline', model: null };
      }
    },
    refetchInterval: 10000,
  });

  // Download model mutation
  const downloadMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const response = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Download failed');
      }
      return response.json();
    },
    onSuccess: (_, modelId) => {
      toast({ title: `Started downloading ${modelId}` });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Download failed', description: error.message, variant: 'destructive' });
    },
  });

  // Delete model mutation
  const deleteMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const response = await fetch(`/api/models/${encodeURIComponent(modelId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Model deleted' });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  // Activate model mutation
  const activateMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const response = await fetch('/api/models/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (!response.ok) throw new Error('Activation failed');
      return response.json();
    },
    onSuccess: (_, modelId) => {
      toast({ title: `Activating ${modelId}`, description: 'vLLM is restarting...' });
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['vllm-status'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Activation failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleDownload = () => {
    const modelId = selectedModel || hfRepoUrl.trim();
    if (!modelId) {
      toast({ title: 'Please enter a model ID or select a model', variant: 'destructive' });
      return;
    }
    downloadMutation.mutate(modelId);
    setHfRepoUrl('');
    setSelectedModel('');
  };

  return (
    <div className="space-y-6">
      {/* vLLM Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            LLM Engine Status
          </CardTitle>
          <CardDescription>Current vLLM server status and active model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {vllmLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : vllmStatus?.status === 'online' ? (
                <>
                  <Badge variant="default" className="bg-green-500">Online</Badge>
                  <span className="text-sm text-muted-foreground">
                    Active: <span className="font-medium text-foreground">{vllmStatus?.model || 'Unknown'}</span>
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="destructive">Offline</Badge>
                  <span className="text-sm text-muted-foreground">vLLM server is not running</span>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['vllm-status'] });
                queryClient.invalidateQueries({ queryKey: ['models'] });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Download New Model */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Model
          </CardTitle>
          <CardDescription>Download models from HuggingFace Hub</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recommended Models */}
          <div className="space-y-2">
            <Label>Recommended Models</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a recommended model..." />
              </SelectTrigger>
              <SelectContent>
                {RECOMMENDED_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.description} • {model.size} • VRAM: {model.vram}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Or custom HF URL */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-muted" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 border-t border-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hf-url">HuggingFace Repository</Label>
            <div className="flex gap-2">
              <Input
                id="hf-url"
                placeholder="e.g., LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct"
                value={hfRepoUrl}
                onChange={(e) => {
                  setHfRepoUrl(e.target.value);
                  if (e.target.value) setSelectedModel('');
                }}
              />
              <Button
                onClick={handleDownload}
                disabled={downloadMutation.isPending || (!selectedModel && !hfRepoUrl.trim())}
              >
                {downloadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a HuggingFace model repository ID (e.g., meta-llama/Llama-3.1-8B-Instruct)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Installed Models */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Installed Models
          </CardTitle>
          <CardDescription>Manage downloaded models</CardDescription>
        </CardHeader>
        <CardContent>
          {modelsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !models?.models?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No models installed yet</p>
              <p className="text-sm">Download a model from HuggingFace to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {models.models.map((model) => (
                <div
                  key={model.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    model.isActive ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {model.isActive && (
                        <Badge variant="default" className="bg-green-500">Active</Badge>
                      )}
                      {model.status === 'downloading' && (
                        <Badge variant="secondary">Downloading</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {model.id} • {model.size}
                    </div>
                    {model.status === 'downloading' && model.progress !== undefined && (
                      <div className="mt-2">
                        <Progress value={model.progress} className="h-2" />
                        <span className="text-xs text-muted-foreground">{model.progress}%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {model.status === 'ready' && !model.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activateMutation.mutate(model.id)}
                        disabled={activateMutation.isPending}
                      >
                        {activateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        <span className="ml-2">Activate</span>
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={model.isActive}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Model</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {model.name}? This will free up {model.size} of disk space.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(model.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
