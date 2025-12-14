'use client';

import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  Trash2,
  Play,
  Bot,
  Database,
  Code,
  GitBranch,
  Globe,
  Type,
  Variable,
  Square,
} from 'lucide-react';

const nodeIcons: Record<string, React.ReactNode> = {
  start: <Play className="h-4 w-4" />,
  end: <Square className="h-4 w-4" />,
  llm: <Bot className="h-4 w-4" />,
  knowledge: <Database className="h-4 w-4" />,
  code: <Code className="h-4 w-4" />,
  'if-else': <GitBranch className="h-4 w-4" />,
  http: <Globe className="h-4 w-4" />,
  template: <Type className="h-4 w-4" />,
  variable: <Variable className="h-4 w-4" />,
};

const nodeColors: Record<string, string> = {
  start: '#22c55e',
  end: '#ef4444',
  llm: '#8b5cf6',
  knowledge: '#3b82f6',
  code: '#f59e0b',
  'if-else': '#ec4899',
  http: '#06b6d4',
  template: '#64748b',
  variable: '#84cc16',
};

export function NodeSettingsPanel() {
  const { nodes, selectedNodeId, selectNode, updateNodeData, removeNode } = useWorkflowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return null;
  }

  const nodeType = selectedNode.data.type;
  const config = selectedNode.data.config || {};

  const handleConfigChange = (key: string, value: unknown) => {
    updateNodeData(selectedNode.id, {
      config: { ...config, [key]: value },
    });
  };

  const handleLabelChange = (label: string) => {
    updateNodeData(selectedNode.id, { label });
  };

  const renderSettings = () => {
    switch (nodeType) {
      case 'start':
        return <StartNodeSettings config={config} onChange={handleConfigChange} />;
      case 'end':
        return <EndNodeSettings config={config} onChange={handleConfigChange} />;
      case 'llm':
        return <LLMNodeSettings config={config} onChange={handleConfigChange} />;
      case 'knowledge':
        return <KnowledgeNodeSettings config={config} onChange={handleConfigChange} />;
      case 'code':
        return <CodeNodeSettings config={config} onChange={handleConfigChange} />;
      case 'if-else':
        return <IfElseNodeSettings config={config} onChange={handleConfigChange} />;
      case 'http':
        return <HttpNodeSettings config={config} onChange={handleConfigChange} />;
      case 'template':
        return <TemplateNodeSettings config={config} onChange={handleConfigChange} />;
      case 'variable':
        return <VariableNodeSettings config={config} onChange={handleConfigChange} />;
      default:
        return <div className="text-sm text-muted-foreground">No settings available</div>;
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-background border-l shadow-lg z-10 flex flex-col">
      <div className="h-14 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-white"
            style={{ backgroundColor: nodeColors[nodeType] || '#64748b' }}
          >
            {nodeIcons[nodeType]}
          </div>
          <span className="font-medium capitalize">{nodeType.replace('-', ' ')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Node Label */}
          <div className="space-y-2">
            <Label>Node Name</Label>
            <Input
              value={selectedNode.data.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Enter node name"
            />
          </div>

          <Separator />

          {/* Node-specific settings */}
          {renderSettings()}
        </div>
      </ScrollArea>

      {/* Delete Button */}
      {nodeType !== 'start' && (
        <div className="p-4 border-t">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              removeNode(selectedNode.id);
              selectNode(null);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Node
          </Button>
        </div>
      )}
    </div>
  );
}

// Start Node Settings
function StartNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const variables = (config.variables as Array<{ name: string; type: string }>) || [];

  const addVariable = () => {
    onChange('variables', [...variables, { name: '', type: 'string' }]);
  };

  const updateVariable = (index: number, field: string, value: string) => {
    const updated = variables.map((v, i) => (i === index ? { ...v, [field]: value } : v));
    onChange('variables', updated);
  };

  const removeVariable = (index: number) => {
    onChange('variables', variables.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Input Variables</Label>
        <Button variant="outline" size="sm" onClick={addVariable}>
          Add
        </Button>
      </div>
      {variables.map((v, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={v.name}
            onChange={(e) => updateVariable(i, 'name', e.target.value)}
            placeholder="Variable name"
            className="flex-1"
          />
          <Select value={v.type} onValueChange={(val) => updateVariable(i, 'type', val)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="array">Array</SelectItem>
              <SelectItem value="object">Object</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => removeVariable(i)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// End Node Settings
function EndNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Output Variable</Label>
        <Input
          value={(config.outputVariable as string) || ''}
          onChange={(e) => onChange('outputVariable', e.target.value)}
          placeholder="e.g., result, answer"
        />
      </div>
    </div>
  );
}

// LLM Node Settings
function LLMNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Model</Label>
        <Select
          value={(config.model as string) || 'gpt-4'}
          onValueChange={(v) => onChange('model', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4">GPT-4</SelectItem>
            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
            <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
            <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={(config.systemPrompt as string) || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          placeholder="You are a helpful assistant..."
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label>User Prompt</Label>
        <Textarea
          value={(config.userPrompt as string) || ''}
          onChange={(e) => onChange('userPrompt', e.target.value)}
          placeholder="Use {{variable}} for inputs"
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Temperature</Label>
          <span className="text-sm text-muted-foreground">
            {((config.temperature as number) || 0.7).toFixed(2)}
          </span>
        </div>
        <Slider
          value={[(config.temperature as number) || 0.7]}
          min={0}
          max={2}
          step={0.01}
          onValueChange={([v]) => onChange('temperature', v)}
        />
      </div>

      <div className="space-y-2">
        <Label>Max Tokens</Label>
        <Input
          type="number"
          value={(config.maxTokens as number) || 2048}
          onChange={(e) => onChange('maxTokens', parseInt(e.target.value) || 2048)}
        />
      </div>
    </div>
  );
}

// Knowledge Node Settings
function KnowledgeNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Dataset ID</Label>
        <Input
          value={(config.datasetId as string) || ''}
          onChange={(e) => onChange('datasetId', e.target.value)}
          placeholder="Select dataset"
        />
      </div>

      <div className="space-y-2">
        <Label>Query Variable</Label>
        <Input
          value={(config.queryVariable as string) || ''}
          onChange={(e) => onChange('queryVariable', e.target.value)}
          placeholder="e.g., {{query}}"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Top K</Label>
          <span className="text-sm text-muted-foreground">
            {(config.topK as number) || 3}
          </span>
        </div>
        <Slider
          value={[(config.topK as number) || 3]}
          min={1}
          max={10}
          step={1}
          onValueChange={([v]) => onChange('topK', v)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Score Threshold</Label>
          <span className="text-sm text-muted-foreground">
            {((config.scoreThreshold as number) || 0.5).toFixed(2)}
          </span>
        </div>
        <Slider
          value={[(config.scoreThreshold as number) || 0.5]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => onChange('scoreThreshold', v)}
        />
      </div>
    </div>
  );
}

// Code Node Settings
function CodeNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Language</Label>
        <Select
          value={(config.language as string) || 'python'}
          onValueChange={(v) => onChange('language', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="javascript">JavaScript</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Code</Label>
        <Textarea
          value={(config.code as string) || ''}
          onChange={(e) => onChange('code', e.target.value)}
          placeholder="def main(inputs):\n    return inputs"
          className="min-h-[200px] font-mono text-sm"
        />
      </div>
    </div>
  );
}

// IF/ELSE Node Settings
function IfElseNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const conditions = (config.conditions as Array<{ variable: string; operator: string; value: string }>) || [];

  const addCondition = () => {
    onChange('conditions', [...conditions, { variable: '', operator: 'eq', value: '' }]);
  };

  const updateCondition = (index: number, field: string, value: string) => {
    const updated = conditions.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    onChange('conditions', updated);
  };

  const removeCondition = (index: number) => {
    onChange('conditions', conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Conditions</Label>
        <Button variant="outline" size="sm" onClick={addCondition}>
          Add
        </Button>
      </div>
      {conditions.map((c, i) => (
        <div key={i} className="space-y-2 p-3 border rounded-lg">
          <div className="flex gap-2">
            <Input
              value={c.variable}
              onChange={(e) => updateCondition(i, 'variable', e.target.value)}
              placeholder="Variable"
              className="flex-1"
            />
            <Button variant="ghost" size="icon" onClick={() => removeCondition(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Select value={c.operator} onValueChange={(v) => updateCondition(i, 'operator', v)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">=</SelectItem>
                <SelectItem value="neq">!=</SelectItem>
                <SelectItem value="gt">&gt;</SelectItem>
                <SelectItem value="lt">&lt;</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={c.value}
              onChange={(e) => updateCondition(i, 'value', e.target.value)}
              placeholder="Value"
              className="flex-1"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// HTTP Node Settings
function HttpNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Method</Label>
        <Select
          value={(config.method as string) || 'GET'}
          onValueChange={(v) => onChange('method', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>URL</Label>
        <Input
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://api.example.com/..."
        />
      </div>

      <div className="space-y-2">
        <Label>Headers (JSON)</Label>
        <Textarea
          value={(config.headers as string) || '{}'}
          onChange={(e) => onChange('headers', e.target.value)}
          placeholder='{"Authorization": "Bearer ..."}'
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Body (JSON)</Label>
        <Textarea
          value={(config.body as string) || ''}
          onChange={(e) => onChange('body', e.target.value)}
          placeholder='{"key": "value"}'
          className="font-mono text-sm min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Timeout (ms)</Label>
        <Input
          type="number"
          value={(config.timeout as number) || 30000}
          onChange={(e) => onChange('timeout', parseInt(e.target.value) || 30000)}
        />
      </div>
    </div>
  );
}

// Template Node Settings
function TemplateNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Template</Label>
        <Textarea
          value={(config.template as string) || ''}
          onChange={(e) => onChange('template', e.target.value)}
          placeholder="Use {{variable}} syntax for dynamic content"
          className="min-h-[200px] font-mono text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Use {`{{variable}}`} syntax to insert values from previous nodes.
      </p>
    </div>
  );
}

// Variable Node Settings
function VariableNodeSettings({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Variable Name</Label>
        <Input
          value={(config.name as string) || ''}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="my_variable"
        />
      </div>

      <div className="space-y-2">
        <Label>Value Type</Label>
        <Select
          value={(config.valueType as string) || 'static'}
          onValueChange={(v) => onChange('valueType', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static Value</SelectItem>
            <SelectItem value="expression">Expression</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Value</Label>
        <Textarea
          value={(config.value as string) || ''}
          onChange={(e) => onChange('value', e.target.value)}
          placeholder={
            config.valueType === 'expression'
              ? '{{input.name}} + " suffix"'
              : 'Static value here'
          }
          className="min-h-[100px]"
        />
      </div>
    </div>
  );
}
