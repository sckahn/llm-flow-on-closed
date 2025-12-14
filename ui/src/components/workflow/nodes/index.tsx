'use client';

import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { BaseNode } from './base-node';
import type { WorkflowNodeData } from '@/lib/stores/workflow-store';
import {
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

export const StartNode = memo(function StartNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Play className="h-4 w-4 text-white" />}
      color="#22c55e"
      showTargetHandle={false}
    />
  );
});

export const EndNode = memo(function EndNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Square className="h-4 w-4 text-white" />}
      color="#ef4444"
      showSourceHandle={false}
    />
  );
});

export const LLMNode = memo(function LLMNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Bot className="h-4 w-4 text-white" />}
      color="#8b5cf6"
    />
  );
});

export const KnowledgeNode = memo(function KnowledgeNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Database className="h-4 w-4 text-white" />}
      color="#3b82f6"
    />
  );
});

export const CodeNode = memo(function CodeNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Code className="h-4 w-4 text-white" />}
      color="#f59e0b"
    />
  );
});

export const IfElseNode = memo(function IfElseNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<GitBranch className="h-4 w-4 text-white" />}
      color="#ec4899"
    />
  );
});

export const HttpNode = memo(function HttpNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Globe className="h-4 w-4 text-white" />}
      color="#06b6d4"
    />
  );
});

export const TemplateNode = memo(function TemplateNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Type className="h-4 w-4 text-white" />}
      color="#64748b"
    />
  );
});

export const VariableNode = memo(function VariableNode(props: NodeProps<WorkflowNodeData>) {
  return (
    <BaseNode
      {...props}
      icon={<Variable className="h-4 w-4 text-white" />}
      color="#84cc16"
    />
  );
});

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LLMNode,
  knowledge: KnowledgeNode,
  code: CodeNode,
  'if-else': IfElseNode,
  http: HttpNode,
  template: TemplateNode,
  variable: VariableNode,
};
