'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Variable, GripVertical } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InputVariable } from '@/types/api';

interface VariableSettingsProps {
  variables: InputVariable[];
  onChange: (variables: InputVariable[]) => void;
}

const variableTypes = [
  { value: 'text-input', label: 'Text Input' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'select', label: 'Select' },
  { value: 'number', label: 'Number' },
];

export function VariableSettings({ variables, onChange }: VariableSettingsProps) {
  const handleAdd = () => {
    const newVar: InputVariable = {
      variable: `var_${variables.length + 1}`,
      label: `Variable ${variables.length + 1}`,
      type: 'text-input',
      required: false,
    };
    onChange([...variables, newVar]);
  };

  const handleRemove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof InputVariable, value: unknown) => {
    const updated = variables.map((v, i) => {
      if (i === index) {
        return { ...v, [field]: value };
      }
      return v;
    });
    onChange(updated);
  };

  const handleOptionsChange = (index: number, optionsStr: string) => {
    const options = optionsStr.split(',').map((s) => s.trim()).filter(Boolean);
    handleChange(index, 'options', options);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Variable className="h-5 w-5" />
            Input Variables
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Variable
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {variables.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No variables defined. Add variables to collect user input.
          </div>
        ) : (
          <div className="space-y-4">
            {variables.map((variable, index) => (
              <div
                key={index}
                className="flex gap-3 items-start p-4 border rounded-lg group hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center h-9 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-4 w-4 cursor-grab" />
                </div>
                <div className="flex-1 grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Variable Name</Label>
                      <Input
                        value={variable.variable}
                        onChange={(e) => handleChange(index, 'variable', e.target.value)}
                        placeholder="variable_name"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Display Label</Label>
                      <Input
                        value={variable.label}
                        onChange={(e) => handleChange(index, 'label', e.target.value)}
                        placeholder="Display Label"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={variable.type}
                        onValueChange={(v) => handleChange(index, 'type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {variableTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {variable.type !== 'select' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Max Length</Label>
                        <Input
                          type="number"
                          value={variable.max_length || ''}
                          onChange={(e) =>
                            handleChange(index, 'max_length', parseInt(e.target.value) || undefined)
                          }
                          placeholder="No limit"
                        />
                      </div>
                    )}
                    {variable.type === 'select' && (
                      <div className="space-y-2 col-span-2">
                        <Label className="text-xs">Options (comma-separated)</Label>
                        <Input
                          value={variable.options?.join(', ') || ''}
                          onChange={(e) => handleOptionsChange(index, e.target.value)}
                          placeholder="Option 1, Option 2, Option 3"
                        />
                      </div>
                    )}
                    {variable.type !== 'select' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Default Value</Label>
                        <Input
                          value={variable.default || ''}
                          onChange={(e) => handleChange(index, 'default', e.target.value)}
                          placeholder="Default"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={variable.required}
                      onCheckedChange={(v) => handleChange(index, 'required', v)}
                    />
                    <Label className="text-xs text-muted-foreground">Required</Label>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
