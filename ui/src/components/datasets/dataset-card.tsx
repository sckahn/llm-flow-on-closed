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
import { MoreHorizontal, Database, FileText, Trash2, Settings } from 'lucide-react';
import type { Dataset } from '@/types/api';

interface DatasetCardProps {
  dataset: Dataset;
  onDelete?: (dataset: Dataset) => void;
}

export function DatasetCard({ dataset, onDelete }: DatasetCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Link href={`/datasets/${dataset.id}`} className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{dataset.name}</h3>
              <Badge variant="secondary" className="mt-1">
                {dataset.indexing_technique === 'high_quality' ? 'High Quality' : 'Economy'}
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
                <Link href={`/datasets/${dataset.id}`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete?.(dataset)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {dataset.description || 'No description'}
        </p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span>{dataset.document_count} documents</span>
          </div>
          <div>
            <span>{dataset.word_count.toLocaleString()} words</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
