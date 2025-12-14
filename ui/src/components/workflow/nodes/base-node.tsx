'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/lib/stores/workflow-store';

interface BaseNodeProps extends NodeProps<WorkflowNodeData> {
  icon: React.ReactNode;
  color: string;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
}

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  icon,
  color,
  showSourceHandle = true,
  showTargetHandle = true,
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 bg-background shadow-sm min-w-[150px] transition-shadow',
        selected ? 'border-primary shadow-md' : 'border-border'
      )}
    >
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-background"
        />
      )}

      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{data.label}</p>
          <p className="text-xs text-muted-foreground capitalize">{data.type}</p>
        </div>
      </div>

      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-background"
        />
      )}
    </div>
  );
});
