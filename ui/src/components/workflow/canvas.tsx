'use client';

import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nodeTypes } from './nodes';
import { useWorkflowStore, type WorkflowNodeData } from '@/lib/stores/workflow-store';
import { NodeSettingsPanel } from './node-settings-panel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Bot, Database, Code, GitBranch, Globe, Type, Variable, Square } from 'lucide-react';

const nodeOptions = [
  { type: 'llm', label: 'LLM', icon: Bot, color: '#8b5cf6' },
  { type: 'knowledge', label: 'Knowledge', icon: Database, color: '#3b82f6' },
  { type: 'code', label: 'Code', icon: Code, color: '#f59e0b' },
  { type: 'if-else', label: 'IF/ELSE', icon: GitBranch, color: '#ec4899' },
  { type: 'http', label: 'HTTP', icon: Globe, color: '#06b6d4' },
  { type: 'template', label: 'Template', icon: Type, color: '#64748b' },
  { type: 'variable', label: 'Variable', icon: Variable, color: '#84cc16' },
  { type: 'end', label: 'End', icon: Square, color: '#ef4444' },
];

export function WorkflowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
  } = useWorkflowStore();

  const handleAddNode = useCallback(
    (type: string, label: string) => {
      const id = `${type}-${Date.now()}`;
      const newNode: Node<WorkflowNodeData> = {
        id,
        type,
        position: {
          x: Math.random() * 400 + 200,
          y: Math.random() * 300 + 100,
        },
        data: { label, type },
      };
      addNode(newNode);
    },
    [addNode]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const { selectedNodeId } = useWorkflowStore();

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
        }}
      >
        <Background gap={15} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="bg-background border rounded-lg"
        />

        <Panel position="top-left">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Node
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {nodeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.type}
                  onClick={() => handleAddNode(option.type, option.label)}
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center mr-2"
                    style={{ backgroundColor: option.color }}
                  >
                    <option.icon className="h-3 w-3 text-white" />
                  </div>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Panel>
      </ReactFlow>

      {/* Node Settings Panel */}
      {selectedNodeId && <NodeSettingsPanel />}
    </div>
  );
}
