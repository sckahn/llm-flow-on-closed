'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, RotateCcw, Loader2, MessageSquare, CheckCircle2, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  conversationApi,
  ConversationResponse,
  ConversationOption,
  ConditionType,
} from '@/lib/api/conversation';
import { GraphViewer } from '@/components/graphrag';
import type { GraphData } from '@/lib/api/graphrag';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  options?: ConversationOption[];
  inputType?: ConditionType;
  needsInput?: boolean;
  graph?: GraphData;
  sources?: Array<{ id: string; name: string; score: number }>;
  intent?: string;
  collectedValues?: Record<string, unknown>;
}

interface ConversationChatProps {
  datasetId?: string;
  onSessionChange?: (sessionId: string | null) => void;
}

export function ConversationChat({ datasetId, onSessionChange }: ConversationChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [collectedValues, setCollectedValues] = useState<Record<string, unknown>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Notify parent of session changes
  useEffect(() => {
    onSessionChange?.(sessionId);
  }, [sessionId, onSessionChange]);

  const handleSendMessage = useCallback(async (text: string, selectedOption?: string, selectedLabel?: string) => {
    if (!text.trim() && !selectedOption) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: selectedLabel || text,  // 라벨 표시 (UUID 대신)
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response: ConversationResponse = await conversationApi.chat({
        session_id: sessionId || undefined,
        message: text,
        selected_option: selectedOption,
        dataset_id: datasetId,
      });

      // Update session
      if (!sessionId) {
        setSessionId(response.session_id);
      }

      // Update intent and collected values
      if (response.current_intent) {
        setCurrentIntent(response.current_intent);
      }
      if (response.collected_values) {
        setCollectedValues(response.collected_values);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message || response.answer || '',
        timestamp: new Date(),
        options: response.options,
        inputType: response.input_type,
        needsInput: response.needs_input,
        graph: response.graph as GraphData | undefined,
        sources: response.sources,
        intent: response.current_intent,
        collectedValues: response.collected_values,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [sessionId, datasetId]);

  const handleOptionSelect = useCallback((option: ConversationOption) => {
    handleSendMessage('', option.value, option.label);  // value와 label 모두 전달
  }, [handleSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  }, [inputValue, handleSendMessage]);

  const handleReset = useCallback(async () => {
    if (sessionId) {
      try {
        await conversationApi.resetSession(sessionId);
      } catch (error) {
        console.error('Reset error:', error);
      }
    }
    setMessages([]);
    setSessionId(null);
    setCurrentIntent(null);
    setCollectedValues({});
    setInputValue('');
  }, [sessionId]);

  const lastMessage = messages[messages.length - 1];
  const showOptions = lastMessage?.role === 'assistant' && lastMessage.needsInput && lastMessage.options;

  return (
    <div className="flex flex-col h-full">
      {/* Session Info Bar */}
      {sessionId && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-sm">
          <div className="flex items-center gap-4">
            {currentIntent && (
              <Badge variant="secondary" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                {currentIntent.replace(/_/g, ' ')}
              </Badge>
            )}
            {Object.keys(collectedValues).length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" />
                <span>{Object.keys(collectedValues).length}개 정보 수집됨</span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1">
            <RotateCcw className="h-3 w-3" />
            새 대화
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">무엇이든 물어보세요</p>
              <p className="text-sm">보험 관련 질문을 하시면 필요한 정보를 단계별로 수집하여 정확한 답변을 드립니다.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-3">
                <div
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-4 py-2',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === 'assistant' && message.intent && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <Badge variant="outline" className="text-xs">
                          {message.intent}
                        </Badge>
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>

                {/* Graph Visualization */}
                {message.graph && message.graph.nodes && message.graph.nodes.length > 0 && (
                  <Card className="ml-11">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">관련 지식 그래프</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <GraphViewer data={message.graph} height="300px" />
                    </CardContent>
                  </Card>
                )}

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="ml-11 flex flex-wrap gap-2">
                    {message.sources.map((source) => (
                      <Badge key={source.id} variant="outline" className="text-xs">
                        {source.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Options Selection */}
      {showOptions && lastMessage.options && (
        <div className="px-4 py-3 border-t bg-muted/30">
          <p className="text-sm text-muted-foreground mb-2">선택해주세요:</p>
          <div className="flex flex-wrap gap-2">
            {lastMessage.options.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                size="sm"
                onClick={() => handleOptionSelect(option)}
                disabled={isLoading}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={showOptions ? "또는 직접 입력하세요..." : "메시지를 입력하세요..."}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={() => handleSendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConversationChat;
