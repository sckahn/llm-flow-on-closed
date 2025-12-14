'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, MessageSquare, Workflow, Bot, FileText, Copy, Trash2, Settings } from 'lucide-react';
import type { App } from '@/types/api';

const modeIcons = {
  chat: MessageSquare,
  completion: FileText,
  'agent-chat': Bot,
  workflow: Workflow,
};

const modeLabels = {
  chat: 'Chat',
  completion: 'Completion',
  'agent-chat': 'Agent',
  workflow: 'Workflow',
};

interface AppCardProps {
  app: App;
  onCopy?: (app: App) => void;
  onDelete?: (app: App) => void;
}

export function AppCard({ app, onCopy, onDelete }: AppCardProps) {
  const Icon = modeIcons[app.mode] || MessageSquare;
  const modeLabel = modeLabels[app.mode] || app.mode;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Link href={`/apps/${app.id}`} className="flex items-center gap-3 flex-1">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: app.icon_background || '#6366f1' }}
            >
              {app.icon ? (
                <span className="text-xl">{app.icon}</span>
              ) : (
                <Icon className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{app.name}</h3>
              <Badge variant="secondary" className="mt-1">
                {modeLabel}
              </Badge>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/apps/${app.id}`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopy?.(app)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete?.(app)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {app.description || 'No description'}
        </p>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span>
            Created {new Date(app.created_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
