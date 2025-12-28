'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeMouseHandler,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Filter, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GraphData, GraphNode, GraphEdge } from '@/lib/api/graphrag';

// Default color palette
const ENTITY_COLORS: Record<string, string> = {
  person: '#4F46E5',
  organization: '#059669',
  location: '#DC2626',
  date: '#D97706',
  concept: '#7C3AED',
  product: '#2563EB',
  event: '#DB2777',
  technology: '#0891B2',
  document: '#65A30D',
  topic: '#EA580C',
  other: '#6B7280',
};

interface GraphViewerProps {
  data: GraphData | null;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  className?: string;
  height?: string;
}

export function GraphViewer({
  data,
  onNodeClick,
  onEdgeClick,
  className,
  height = '600px',
}: GraphViewerProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());

  // Initialize visible types when data changes
  useEffect(() => {
    if (data?.nodes) {
      const types = new Set(data.nodes.map(n => n.type.toLowerCase()));
      setVisibleTypes(types);
    }
  }, [data]);

  // Convert GraphData to ReactFlow format
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data) return { initialNodes: [], initialEdges: [] };

    // Create a simple force-directed layout simulation
    const nodeCount = data.nodes.length;
    const radius = Math.max(200, nodeCount * 30);

    const nodes: Node[] = data.nodes
      .filter(node => visibleTypes.has(node.type.toLowerCase()))
      .map((node, index) => {
        // Circular layout
        const angle = (2 * Math.PI * index) / nodeCount;
        const x = node.x ?? radius * Math.cos(angle) + radius;
        const y = node.y ?? radius * Math.sin(angle) + radius;

        const nodeType = node.type.toLowerCase();
        const color = node.color || ENTITY_COLORS[nodeType] || ENTITY_COLORS.other;
        const size = node.size || 40;

        return {
          id: node.id,
          position: { x, y },
          data: {
            label: node.label,
            type: node.type,
            properties: node.properties,
            originalNode: node,
          },
          style: {
            background: color,
            color: '#fff',
            border: `2px solid ${color}`,
            borderRadius: '50%',
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: selectedNode?.id === node.id
              ? `0 0 0 4px ${color}40`
              : '0 2px 4px rgba(0,0,0,0.1)',
          },
        };
      });

    const visibleNodeIds = new Set(nodes.map(n => n.id));

    // Deduplicate edges by creating unique keys with index for same source-target pairs
    const seenEdgeKeys = new Map<string, number>();
    const edges: Edge[] = data.edges
      .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => {
        // Create a base key from source, target, and label
        const baseKey = `${edge.source}_${edge.target}_${edge.label || edge.type}`;
        const count = seenEdgeKeys.get(baseKey) || 0;
        seenEdgeKeys.set(baseKey, count + 1);

        // Make ID unique by appending count if there are duplicates
        const uniqueId = count > 0 ? `${edge.id || baseKey}_${count}` : (edge.id || baseKey);

        return {
          id: uniqueId,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: '#94a3b8',
            strokeWidth: Math.min(edge.weight || 1, 3),
          },
          labelStyle: {
            fontSize: 10,
            fill: '#64748b',
          },
          labelBgStyle: {
            fill: '#fff',
            fillOpacity: 0.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94a3b8',
          },
          data: {
            originalEdge: edge,
          },
        };
      });

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, visibleTypes, selectedNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const originalNode = node.data.originalNode as GraphNode;
      setSelectedNode(originalNode);
      onNodeClick?.(originalNode);
    },
    [onNodeClick]
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const originalEdge = edge.data?.originalEdge as GraphEdge;
      if (originalEdge) {
        onEdgeClick?.(originalEdge);
      }
    },
    [onEdgeClick]
  );

  const handleTypeToggle = (type: string) => {
    setVisibleTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Get unique types for filter
  const uniqueTypes = useMemo(() => {
    if (!data?.nodes) return [];
    const types = new Set(data.nodes.map(n => n.type.toLowerCase()));
    return Array.from(types).sort();
  }, [data]);

  if (!data || data.nodes.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded-lg ${className}`}
        style={{ height }}
      >
        <div className="text-center text-muted-foreground">
          <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>그래프 데이터가 없습니다</p>
          <p className="text-sm">질문을 입력하면 관련 그래프가 표시됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={4}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => node.style?.background as string || '#6B7280'}
          maskColor="rgba(0, 0, 0, 0.1)"
        />

        {/* Filter Panel */}
        <Panel position="top-left">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="bg-background">
                <Filter className="h-4 w-4 mr-2" />
                필터
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="start">
              <div className="space-y-2">
                <p className="text-sm font-medium">엔티티 유형</p>
                {uniqueTypes.map(type => (
                  <div key={type} className="flex items-center gap-2">
                    <Checkbox
                      id={type}
                      checked={visibleTypes.has(type)}
                      onCheckedChange={() => handleTypeToggle(type)}
                    />
                    <label
                      htmlFor={type}
                      className="text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.other }}
                      />
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </Panel>

        {/* Legend */}
        <Panel position="top-right">
          <Card className="w-48">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">범례</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <div className="space-y-1">
                {uniqueTypes.slice(0, 6).map(type => (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.other }}
                    />
                    <span className="truncate">{type}</span>
                  </div>
                ))}
                {uniqueTypes.length > 6 && (
                  <p className="text-xs text-muted-foreground">
                    +{uniqueTypes.length - 6} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </Panel>

        {/* Stats Panel */}
        <Panel position="bottom-right">
          <div className="flex gap-2">
            <Badge variant="secondary">
              노드: {nodes.length}
            </Badge>
            <Badge variant="secondary">
              엣지: {edges.length}
            </Badge>
          </div>
        </Panel>
      </ReactFlow>

      {/* Selected Node Info */}
      {selectedNode && (
        <Card className="absolute bottom-4 left-4 w-72 z-10">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: ENTITY_COLORS[selectedNode.type.toLowerCase()] || ENTITY_COLORS.other
                  }}
                />
                {selectedNode.label}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {selectedNode.type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="py-2 px-3">
            {selectedNode.properties?.description ? (
              <p className="text-xs text-muted-foreground">
                {String(selectedNode.properties.description)}
              </p>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={() => setSelectedNode(null)}
            >
              닫기
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
