'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, Wand2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

interface PromptEditorProps {
  promptType: 'simple' | 'advanced';
  prePrompt?: string;
  messages?: PromptMessage[];
  variables?: string[];
  onChange: (data: {
    promptType: 'simple' | 'advanced';
    prePrompt?: string;
    messages?: PromptMessage[];
  }) => void;
}

export function PromptEditor({
  promptType,
  prePrompt = '',
  messages = [],
  variables = [],
  onChange,
}: PromptEditorProps) {
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>(promptType);

  const handlePromptTypeChange = (type: 'simple' | 'advanced') => {
    setActiveTab(type);
    onChange({
      promptType: type,
      prePrompt: type === 'simple' ? prePrompt : undefined,
      messages: type === 'advanced' ? messages : undefined,
    });
  };

  const handlePrePromptChange = (value: string) => {
    onChange({
      promptType: 'simple',
      prePrompt: value,
    });
  };

  const handleAddMessage = () => {
    const newMessages = [...messages, { role: 'user' as const, text: '' }];
    onChange({
      promptType: 'advanced',
      messages: newMessages,
    });
  };

  const handleRemoveMessage = (index: number) => {
    const newMessages = messages.filter((_, i) => i !== index);
    onChange({
      promptType: 'advanced',
      messages: newMessages,
    });
  };

  const handleMessageChange = (index: number, field: 'role' | 'text', value: string) => {
    const newMessages = messages.map((msg, i) => {
      if (i === index) {
        return { ...msg, [field]: value };
      }
      return msg;
    });
    onChange({
      promptType: 'advanced',
      messages: newMessages,
    });
  };

  const insertVariable = (variable: string, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const newText = text.substring(0, start) + `{{${variable}}}` + text.substring(end);

    if (activeTab === 'simple') {
      handlePrePromptChange(newText);
    }
  };

  const roleColors: Record<string, string> = {
    system: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    user: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    assistant: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Prompt
          </CardTitle>
          {variables.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Variables:</span>
              <div className="flex gap-1">
                {variables.map((v) => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => {
                      const textarea = document.querySelector('textarea:focus') as HTMLTextAreaElement;
                      insertVariable(v, textarea);
                    }}
                  >
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => handlePromptTypeChange(v as 'simple' | 'advanced')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="simple">Simple</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-4">
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={prePrompt}
                onChange={(e) => handlePrePromptChange(e.target.value)}
                placeholder="You are a helpful assistant..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {`{{variable}}`} syntax to insert user input variables.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <div key={index} className="flex gap-2 items-start group">
                  <div className="flex items-center h-9 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4 cursor-grab" />
                  </div>
                  <div className="w-28">
                    <Select
                      value={msg.role}
                      onValueChange={(v) => handleMessageChange(index, 'role', v)}
                    >
                      <SelectTrigger className={roleColors[msg.role]}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Textarea
                      value={msg.text}
                      onChange={(e) => handleMessageChange(index, 'text', e.target.value)}
                      placeholder={`Enter ${msg.role} message...`}
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMessage(index)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={handleAddMessage}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Message
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
