'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Settings2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { getModelProviders } from '@/lib/api/apps';
import type { AppModelConfig, ModelParameters } from '@/types/api';

interface ModelSelectorProps {
  config?: AppModelConfig;
  onChange: (config: AppModelConfig) => void;
}

const defaultParams: ModelParameters = {
  temperature: 0.7,
  top_p: 1,
  max_tokens: 2048,
  presence_penalty: 0,
  frequency_penalty: 0,
};

export function ModelSelector({ config, onChange }: ModelSelectorProps) {
  const [paramsOpen, setParamsOpen] = useState(false);

  const { data: providers, isLoading } = useQuery({
    queryKey: ['model-providers'],
    queryFn: getModelProviders,
  });

  const selectedProvider = config?.provider || '';
  const selectedModel = config?.model_id || '';
  const params = config?.completion_params || defaultParams;

  const providerModels = providers?.data?.find((p) => p.provider === selectedProvider)?.models || [];

  const handleProviderChange = (provider: string) => {
    const firstModel = providers?.data?.find((p) => p.provider === provider)?.models?.[0];
    onChange({
      provider,
      model_id: firstModel?.model || '',
      model_name: firstModel?.label || '',
      mode: 'chat',
      completion_params: params,
    });
  };

  const handleModelChange = (modelId: string) => {
    const model = providerModels.find((m) => m.model === modelId);
    onChange({
      ...config!,
      model_id: modelId,
      model_name: model?.label || modelId,
    });
  };

  const handleParamChange = (key: keyof ModelParameters, value: number) => {
    onChange({
      ...config!,
      completion_params: {
        ...params,
        [key]: value,
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers?.data?.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Select
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={!selectedProvider}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {providerModels
                  .filter((m) => m.model_type === 'llm')
                  .map((m) => (
                    <SelectItem key={m.model} value={m.model}>
                      {m.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Collapsible open={paramsOpen} onOpenChange={setParamsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Settings2 className="h-4 w-4" />
                Model Parameters
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${paramsOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Temperature</Label>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {params.temperature?.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[params.temperature || 0.7]}
                min={0}
                max={2}
                step={0.01}
                onValueChange={([v]) => handleParamChange('temperature', v)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Top P</Label>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {params.top_p?.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[params.top_p || 1]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => handleParamChange('top_p', v)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Max Tokens</Label>
              <Input
                type="number"
                value={params.max_tokens || 2048}
                onChange={(e) => handleParamChange('max_tokens', parseInt(e.target.value) || 2048)}
                min={1}
                max={128000}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Presence Penalty</Label>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {params.presence_penalty?.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[params.presence_penalty || 0]}
                min={-2}
                max={2}
                step={0.01}
                onValueChange={([v]) => handleParamChange('presence_penalty', v)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Frequency Penalty</Label>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {params.frequency_penalty?.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[params.frequency_penalty || 0]}
                min={-2}
                max={2}
                step={0.01}
                onValueChange={([v]) => handleParamChange('frequency_penalty', v)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
