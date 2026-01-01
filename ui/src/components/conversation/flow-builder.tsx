'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  conversationApi,
  FlowGraph,
  IntentNode as IntentNodeType,
  ConditionNode as ConditionNodeType,
  ActionNode as ActionNodeType,
} from '@/lib/api/conversation';

// Node colors by type
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  intent: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  condition: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  action: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  response: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
};

// Edge colors by type
const EDGE_COLORS: Record<string, string> = {
  REQUIRES: '#3b82f6',
  NEXT: '#6b7280',
  BRANCH: '#f59e0b',
  SATISFIED: '#22c55e',
  LEADS_TO: '#a855f7',
};

interface FlowBuilderProps {
  intentId?: string;
  height?: string;
}

export function FlowBuilder({ intentId, height = '600px' }: FlowBuilderProps) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const {
    data: flowGraph,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['flow-graph', intentId],
    queryFn: () => conversationApi.getFlowGraph(intentId),
    staleTime: 30000,
  });

  // Convert flow graph to ReactFlow nodes and edges
  const buildFlowNodes = useCallback((graph: FlowGraph): { nodes: Node[]; edges: Edge[] } => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const nodePositions: Map<string, { x: number; y: number }> = new Map();

    // Calculate positions based on node type and order
    let intentY = 0;
    let conditionY = 0;
    let actionY = 0;

    // Add Intent nodes (left column)
    graph.intents.forEach((intent, i) => {
      const y = i * 150;
      nodePositions.set(intent.id, { x: 0, y });
      flowNodes.push({
        id: intent.id,
        type: 'default',
        position: { x: 0, y },
        data: {
          label: (
            <div className="p-2 text-center">
              <div className="font-semibold text-sm">{intent.display_name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {intent.keywords.slice(0, 3).join(', ')}
              </div>
            </div>
          ),
          nodeType: 'intent',
          nodeData: intent,
        },
        style: {
          background: NODE_COLORS.intent.bg,
          border: `2px solid ${NODE_COLORS.intent.border}`,
          borderRadius: '8px',
          padding: '4px',
          minWidth: '150px',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      intentY = Math.max(intentY, y);
    });

    // Add Condition nodes (middle column)
    graph.conditions.forEach((condition, i) => {
      const y = i * 120;
      nodePositions.set(condition.id, { x: 300, y });
      flowNodes.push({
        id: condition.id,
        type: 'default',
        position: { x: 300, y },
        data: {
          label: (
            <div className="p-2 text-center">
              <div className="font-semibold text-sm">{condition.display_name}</div>
              <Badge variant="outline" className="text-xs mt-1">
                {condition.condition_type}
              </Badge>
            </div>
          ),
          nodeType: 'condition',
          nodeData: condition,
        },
        style: {
          background: NODE_COLORS.condition.bg,
          border: `2px solid ${NODE_COLORS.condition.border}`,
          borderRadius: '8px',
          padding: '4px',
          minWidth: '150px',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      conditionY = Math.max(conditionY, y);
    });

    // Add Action nodes (right column)
    graph.actions.forEach((action, i) => {
      const y = i * 120;
      nodePositions.set(action.id, { x: 600, y });
      flowNodes.push({
        id: action.id,
        type: 'default',
        position: { x: 600, y },
        data: {
          label: (
            <div className="p-2 text-center">
              <div className="font-semibold text-sm">{action.name}</div>
              <Badge variant="outline" className="text-xs mt-1">
                {action.action_type}
              </Badge>
            </div>
          ),
          nodeType: 'action',
          nodeData: action,
        },
        style: {
          background: NODE_COLORS.action.bg,
          border: `2px solid ${NODE_COLORS.action.border}`,
          borderRadius: '8px',
          padding: '4px',
          minWidth: '150px',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      actionY = Math.max(actionY, y);
    });

    // Add edges
    graph.edges.forEach((edge) => {
      flowEdges.push({
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        type: 'smoothstep',
        animated: edge.edge_type === 'BRANCH',
        label: edge.condition || edge.edge_type,
        labelStyle: { fontSize: 10, fill: '#666' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
        style: {
          stroke: EDGE_COLORS[edge.edge_type] || '#6b7280',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: EDGE_COLORS[edge.edge_type] || '#6b7280',
        },
      });
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, []);

  // Update nodes and edges when flow graph changes
  useEffect(() => {
    if (flowGraph) {
      const { nodes: newNodes, edges: newEdges } = buildFlowNodes(flowGraph);
      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [flowGraph, buildFlowNodes, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const handleSeedData = useCallback(async () => {
    try {
      await conversationApi.seedFlowData();
      toast({ title: '시드 데이터 생성 완료' });
      refetch();
    } catch (error) {
      toast({
        title: '시드 데이터 생성 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    }
  }, [toast, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ height }}>
        <p className="text-destructive">플로우 그래프를 불러오는데 실패했습니다.</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          다시 시도
        </Button>
      </div>
    );
  }

  const hasData = flowGraph && (flowGraph.intents.length > 0 || flowGraph.conditions.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: NODE_COLORS.intent.bg, border: `1px solid ${NODE_COLORS.intent.border}` }} />
            <span className="text-sm">Intent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: NODE_COLORS.condition.bg, border: `1px solid ${NODE_COLORS.condition.border}` }} />
            <span className="text-sm">Condition</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: NODE_COLORS.action.bg, border: `1px solid ${NODE_COLORS.action.border}` }} />
            <span className="text-sm">Action</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
          <Button variant="outline" size="sm" onClick={handleSeedData}>
            <Sparkles className="h-4 w-4 mr-2" />
            샘플 데이터
          </Button>
        </div>
      </div>

      {/* Flow Canvas */}
      <div className="border rounded-lg overflow-hidden" style={{ height }}>
        {hasData ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const nodeType = node.data?.nodeType as string;
                return NODE_COLORS[nodeType]?.border || '#6b7280';
              }}
              maskColor="rgba(0,0,0,0.1)"
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Sparkles className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">대화 흐름이 없습니다</p>
            <p className="text-sm mb-4">샘플 데이터를 생성하거나 새 Intent를 추가하세요</p>
            <Button onClick={handleSeedData}>
              <Sparkles className="h-4 w-4 mr-2" />
              샘플 데이터 생성
            </Button>
          </div>
        )}
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge
                style={{
                  background: NODE_COLORS[selectedNode.data?.nodeType]?.bg,
                  color: NODE_COLORS[selectedNode.data?.nodeType]?.text,
                  border: `1px solid ${NODE_COLORS[selectedNode.data?.nodeType]?.border}`,
                }}
              >
                {selectedNode.data?.nodeType}
              </Badge>
              {selectedNode.data?.nodeData?.display_name || selectedNode.data?.nodeData?.name}
            </CardTitle>
            <CardDescription>ID: {selectedNode.id}</CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
              {JSON.stringify(selectedNode.data?.nodeData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FlowBuilder;
