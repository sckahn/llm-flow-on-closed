'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, Settings2, Search, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { getDatasets } from '@/lib/api/datasets';
import type { DatasetConfig } from '@/types/api';

interface KnowledgeBaseConfigProps {
  configs: DatasetConfig[];
  onChange: (configs: DatasetConfig[]) => void;
}

const searchMethods = [
  { value: 'semantic', label: 'Semantic Search', description: 'Uses vector embeddings for meaning-based search' },
  { value: 'full_text', label: 'Full Text', description: 'Traditional keyword-based search' },
  { value: 'hybrid', label: 'Hybrid', description: 'Combines semantic and full text search' },
];

export function KnowledgeBaseConfig({ configs, onChange }: KnowledgeBaseConfigProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets(1, 100),
  });

  const handleToggleDataset = (datasetId: string, enabled: boolean) => {
    const existing = configs.find((c) => c.dataset_id === datasetId);
    if (existing) {
      if (enabled) {
        onChange(configs.map((c) => (c.dataset_id === datasetId ? { ...c, enabled: true } : c)));
      } else {
        onChange(configs.filter((c) => c.dataset_id !== datasetId));
      }
    } else if (enabled) {
      onChange([
        ...configs,
        {
          dataset_id: datasetId,
          enabled: true,
          retrieval_model: {
            search_method: 'semantic',
            top_k: 3,
            score_threshold: 0.5,
          },
        },
      ]);
    }
  };

  const handleRetrievalChange = (
    datasetId: string,
    field: 'search_method' | 'top_k' | 'score_threshold',
    value: string | number
  ) => {
    onChange(
      configs.map((c) => {
        if (c.dataset_id === datasetId) {
          return {
            ...c,
            retrieval_model: {
              ...c.retrieval_model!,
              [field]: value,
            },
          };
        }
        return c;
      })
    );
  };

  const enabledConfigs = configs.filter((c) => c.enabled);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Knowledge Base
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5" />
          Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {datasets?.data?.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No datasets available. Create a dataset first.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-sm">Select Datasets</Label>
              <div className="border rounded-lg divide-y max-h-48 overflow-auto">
                {datasets?.data?.map((dataset) => {
                  const isEnabled = configs.some(
                    (c) => c.dataset_id === dataset.id && c.enabled
                  );
                  return (
                    <div
                      key={dataset.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={isEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleDataset(dataset.id, checked as boolean)
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {dataset.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dataset.document_count} documents · {dataset.word_count.toLocaleString()} words
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {enabledConfigs.length > 0 && (
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-0 hover:bg-transparent"
                  >
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Settings2 className="h-4 w-4" />
                      Retrieval Settings
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {enabledConfigs.map((config) => {
                    const dataset = datasets?.data?.find((d) => d.id === config.dataset_id);
                    if (!dataset) return null;

                    return (
                      <div key={config.dataset_id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{dataset.name}</span>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Search Method</Label>
                          <Select
                            value={config.retrieval_model?.search_method || 'semantic'}
                            onValueChange={(v) =>
                              handleRetrievalChange(config.dataset_id, 'search_method', v)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {searchMethods.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  <div>
                                    <div>{m.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {m.description}
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Top K</Label>
                              <span className="text-xs text-muted-foreground">
                                {config.retrieval_model?.top_k || 3}
                              </span>
                            </div>
                            <Slider
                              value={[config.retrieval_model?.top_k || 3]}
                              min={1}
                              max={10}
                              step={1}
                              onValueChange={([v]) =>
                                handleRetrievalChange(config.dataset_id, 'top_k', v)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Score Threshold</Label>
                              <span className="text-xs text-muted-foreground">
                                {(config.retrieval_model?.score_threshold || 0.5).toFixed(2)}
                              </span>
                            </div>
                            <Slider
                              value={[config.retrieval_model?.score_threshold || 0.5]}
                              min={0}
                              max={1}
                              step={0.01}
                              onValueChange={([v]) =>
                                handleRetrievalChange(config.dataset_id, 'score_threshold', v)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
