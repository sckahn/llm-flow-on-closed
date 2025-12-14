'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, MessageSquare, FileText, Bot, Workflow } from 'lucide-react';
import type { AppMode } from '@/types/api';

const appTypes: { mode: AppMode; label: string; description: string; icon: React.ElementType }[] = [
  {
    mode: 'chat',
    label: 'Chat App',
    description: 'Conversational AI with memory',
    icon: MessageSquare,
  },
  {
    mode: 'completion',
    label: 'Completion',
    description: 'Single prompt, single response',
    icon: FileText,
  },
  {
    mode: 'agent-chat',
    label: 'Agent',
    description: 'AI with tool-calling capabilities',
    icon: Bot,
  },
  {
    mode: 'workflow',
    label: 'Workflow',
    description: 'Visual workflow builder',
    icon: Workflow,
  },
];

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; mode: AppMode; description?: string }) => Promise<void>;
}

export function CreateAppDialog({ open, onOpenChange, onSubmit }: CreateAppDialogProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AppMode>('chat');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit({ name, mode, description: description || undefined });
      setName('');
      setMode('chat');
      setDescription('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New App</DialogTitle>
          <DialogDescription>
            Choose an app type and provide basic information.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>App Type</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as AppMode)}
              className="grid grid-cols-2 gap-3"
            >
              {appTypes.map((type) => (
                <Label
                  key={type.mode}
                  htmlFor={type.mode}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    mode === type.mode
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value={type.mode} id={type.mode} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <type.icon className="h-4 w-4" />
                      <span className="font-medium">{type.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {type.description}
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this app does..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create App
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
