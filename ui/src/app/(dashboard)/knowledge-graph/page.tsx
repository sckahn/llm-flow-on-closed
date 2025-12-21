'use client';

import { useState, useCallback } from 'react';
import { Network, Search, BookOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NaturalQuery, GraphViewer, NarrativeView, GraphStats } from '@/components/graphrag';
import { NarrativeResponse, GraphNode, GraphData } from '@/lib/api/graphrag';

export default function KnowledgeGraphPage() {
  const [selectedDataset, setSelectedDataset] = useState<string | undefined>(undefined);
  const [queryResults, setQueryResults] = useState<NarrativeResponse | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('explore');

  // Handle natural language query results
  const handleQueryResults = useCallback((results: NarrativeResponse | null) => {
    setQueryResults(results);
    setSelectedEntityId(null);
  }, []);

  // Handle node click in graph viewer
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedEntityId(node.id);
  }, []);

  // Handle entity click in narrative view
  const handleEntityClick = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    // Could also navigate to entity details or expand graph
  }, []);

  // Get graph data from query results
  const graphData: GraphData | null = queryResults?.graph || null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Network className="h-8 w-8 text-primary" />
            Knowledge Graph
          </h1>
          <p className="text-muted-foreground mt-1">
            자연어로 지식 그래프를 탐색하고 인사이트를 발견하세요
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedDataset} onValueChange={setSelectedDataset}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="데이터셋 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 데이터셋</SelectItem>
              {/* Dataset options would be loaded dynamically */}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Overview */}
      <GraphStats datasetId={selectedDataset} />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="explore" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            탐색
          </TabsTrigger>
          <TabsTrigger value="visualize" className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            시각화
          </TabsTrigger>
          <TabsTrigger value="stories" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            스토리
          </TabsTrigger>
        </TabsList>

        {/* Explore Tab - Natural Language Query */}
        <TabsContent value="explore" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                자연어 탐색
              </CardTitle>
              <CardDescription>
                평소 말하듯이 질문하면 관련된 정보를 그래프에서 찾아드립니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NaturalQuery
                datasetId={selectedDataset}
                onResultsChange={handleQueryResults}
              />
            </CardContent>
          </Card>

          {/* Graph Visualization for Query Results */}
          {graphData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  관련 그래프
                </CardTitle>
                <CardDescription>
                  질문과 관련된 엔티티와 관계를 시각화합니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GraphViewer
                  data={graphData}
                  onNodeClick={handleNodeClick}
                  height="500px"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Visualize Tab - Full Graph View */}
        <TabsContent value="visualize" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="h-[700px]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    지식 그래프
                  </CardTitle>
                  <CardDescription>
                    노드를 클릭하면 상세 정보를 볼 수 있습니다
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[calc(100%-80px)]">
                  <GraphViewer
                    data={graphData}
                    onNodeClick={handleNodeClick}
                    height="100%"
                  />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              {/* Entity Details */}
              {selectedEntityId ? (
                <NarrativeView
                  entityId={selectedEntityId}
                  onEntityClick={handleEntityClick}
                />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      그래프에서 노드를 클릭하면
                      <br />
                      상세 정보가 표시됩니다
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">빠른 탐색</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <NaturalQuery
                    datasetId={selectedDataset}
                    onResultsChange={handleQueryResults}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Stories Tab - Narrative View */}
        <TabsContent value="stories" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  스토리텔링 뷰
                </CardTitle>
                <CardDescription>
                  그래프 관계를 이해하기 쉬운 이야기로 설명합니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NarrativeView
                  datasetId={selectedDataset}
                  narrative={queryResults}
                  onEntityClick={handleEntityClick}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  질문하기
                </CardTitle>
                <CardDescription>
                  궁금한 것을 물어보세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NaturalQuery
                  datasetId={selectedDataset}
                  onResultsChange={handleQueryResults}
                />
              </CardContent>
            </Card>
          </div>

          {/* Related Graph */}
          {graphData && (
            <Card>
              <CardHeader>
                <CardTitle>관련 그래프</CardTitle>
              </CardHeader>
              <CardContent>
                <GraphViewer
                  data={graphData}
                  onNodeClick={handleNodeClick}
                  height="400px"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
