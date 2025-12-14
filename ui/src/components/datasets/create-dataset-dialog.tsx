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
import { Loader2 } from 'lucide-react';

interface CreateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    indexing_technique: 'high_quality' | 'economy';
  }) => Promise<void>;
}

export function CreateDatasetDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [indexingTechnique, setIndexingTechnique] = useState<'high_quality' | 'economy'>(
    'high_quality'
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit({
        name,
        description: description || undefined,
        indexing_technique: indexingTechnique,
      });
      setName('');
      setDescription('');
      setIndexingTechnique('high_quality');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Dataset</DialogTitle>
          <DialogDescription>
            Create a new knowledge base to store documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Knowledge Base"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of documents will be stored..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Indexing Method</Label>
            <RadioGroup
              value={indexingTechnique}
              onValueChange={(v) => setIndexingTechnique(v as 'high_quality' | 'economy')}
              className="space-y-2"
            >
              <Label
                htmlFor="high_quality"
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                  indexingTechnique === 'high_quality'
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
              >
                <RadioGroupItem value="high_quality" id="high_quality" className="mt-1" />
                <div>
                  <span className="font-medium">High Quality</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Better accuracy, uses more tokens for embedding
                  </p>
                </div>
              </Label>
              <Label
                htmlFor="economy"
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                  indexingTechnique === 'economy'
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
              >
                <RadioGroupItem value="economy" id="economy" className="mt-1" />
                <div>
                  <span className="font-medium">Economy</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Faster and cheaper, good for large datasets
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Dataset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
