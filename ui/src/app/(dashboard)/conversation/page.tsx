'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, GitBranch, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ConversationChat, FlowBuilder } from '@/components/conversation';
import { getDatasets } from '@/lib/api/datasets';
import { conversationApi } from '@/lib/api/conversation';
import type { Dataset } from '@/types/api';

export default function ConversationPage() {
  const searchParams = useSearchParams();
  const datasetIdFromUrl = searchParams.get('dataset');

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | undefined>(
    datasetIdFromUrl || undefined
  );
  const [activeTab, setActiveTab] = useState('chat');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<string[]>([]);

  // Load datasets on mount
  useEffect(() => {
    getDatasets(1, 100)
      .then((response) => setDatasets(response.data || []))
      .catch(console.error);
  }, []);

  // Load active sessions
  useEffect(() => {
    conversationApi.listSessions(10)
      .then((response) => setActiveSessions(response.sessions))
      .catch(console.error);
  }, [sessionId]);

  // Update selected dataset from URL
  useEffect(() => {
    if (datasetIdFromUrl) {
      setSelectedDataset(datasetIdFromUrl);
    }
  }, [datasetIdFromUrl]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            대화형 검색
          </h1>
          <p className="text-muted-foreground mt-1">
            멀티스텝 조건 흐름 기반의 지능형 대화 시스템
          </p>
        </div>
        <div className="flex items-center gap-4">
          {sessionId && (
            <Badge variant="outline" className="gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              세션 활성
            </Badge>
          )}
          <Select
            value={selectedDataset || 'all'}
            onValueChange={(v) => setSelectedDataset(v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="데이터셋 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 데이터셋</SelectItem>
              {datasets.map((ds) => (
                <SelectItem key={ds.id} value={ds.id}>
                  {ds.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            대화
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            흐름 관리
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            세션
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-6">
          <Card className="h-[calc(100vh-280px)] min-h-[500px]">
            <ConversationChat
              datasetId={selectedDataset}
              onSessionChange={setSessionId}
            />
          </Card>
        </TabsContent>

        {/* Flow Management Tab */}
        <TabsContent value="flow" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                대화 흐름 그래프
              </CardTitle>
              <CardDescription>
                Intent → Condition → Action 흐름을 시각적으로 관리합니다.
                BRANCH 엣지는 조건부 분기를, NEXT 엣지는 순차 진행을 의미합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FlowBuilder height="600px" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  활성 세션
                </CardTitle>
                <CardDescription>
                  현재 진행 중인 대화 세션 목록
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeSessions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    활성 세션이 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((session) => (
                      <div
                        key={session}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <code className="text-sm">{session.slice(0, 8)}...</code>
                        <Badge variant={session === sessionId ? 'default' : 'secondary'}>
                          {session === sessionId ? '현재 세션' : '대기'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>대화 흐름 안내</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">지원되는 의도 (Intent)</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>보험금 청구</strong>: 보험금, 청구, 지급 등</li>
                    <li>• <strong>해지 환급금</strong>: 해지, 환급금, 해약 등</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">조건 수집 흐름</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>1. 상품 종류 선택</li>
                    <li>2. (보험금) 청구 사유 선택</li>
                    <li>2. (해지) 가입 기간 선택</li>
                    <li>3. 그래프 검색 및 답변 생성</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">입력 방식</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 버튼 선택: 제시된 옵션 중 선택</li>
                    <li>• 직접 입력: 자유롭게 텍스트 입력</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
