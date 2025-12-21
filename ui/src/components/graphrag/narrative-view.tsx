'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, RefreshCw, User, Building, MapPin, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getEntityStory, getDatasetSummary, NarrativeResponse } from '@/lib/api/graphrag';

// Icon mapping for entity types
const TYPE_ICONS: Record<string, React.ReactNode> = {
  person: <User className="h-4 w-4" />,
  organization: <Building className="h-4 w-4" />,
  location: <MapPin className="h-4 w-4" />,
  concept: <Lightbulb className="h-4 w-4" />,
};

interface NarrativeViewProps {
  datasetId?: string;
  entityId?: string;
  narrative?: NarrativeResponse | null;
  onEntityClick?: (entityId: string) => void;
  className?: string;
}

export function NarrativeView({
  datasetId,
  entityId,
  narrative: externalNarrative,
  onEntityClick,
  className,
}: NarrativeViewProps) {
  const [narrative, setNarrative] = useState<NarrativeResponse | null>(externalNarrative || null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use external narrative if provided
  useEffect(() => {
    if (externalNarrative) {
      setNarrative(externalNarrative);
    }
  }, [externalNarrative]);

  // Load entity story if entityId provided
  useEffect(() => {
    if (entityId && !externalNarrative) {
      loadEntityStory(entityId);
    }
  }, [entityId, externalNarrative]);

  // Load dataset summary if datasetId provided and no entity selected
  useEffect(() => {
    if (datasetId && !entityId && !externalNarrative) {
      loadDatasetSummary(datasetId);
    }
  }, [datasetId, entityId, externalNarrative]);

  const loadEntityStory = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getEntityStory(id, 2);
      setNarrative(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '스토리를 불러오는 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDatasetSummary = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDatasetSummary(id);
      setSummary(response.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요약을 불러오는 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    if (entityId) {
      loadEntityStory(entityId);
    } else if (datasetId) {
      loadDatasetSummary(datasetId);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show dataset summary
  if (summary && !narrative) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            데이터셋 요약
          </CardTitle>
          <CardDescription>
            지식 그래프 개요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap">{summary}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show narrative/story
  if (narrative) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              스토리
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {narrative.question && (
            <CardDescription>
              &ldquo;{narrative.question}&rdquo;
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Narrative */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap leading-relaxed">
              {narrative.narrative || narrative.answer}
            </p>
          </div>

          {/* Entity Timeline/Journey */}
          {narrative.graph && narrative.graph.nodes.length > 0 && (
            <div className="border-l-2 border-primary/30 pl-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">관련 엔티티 여정</p>
              {narrative.graph.nodes.slice(0, 5).map((node) => (
                <div key={node.id} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-primary" />

                  <button
                    onClick={() => onEntityClick?.(node.id)}
                    className="group flex items-start gap-3 hover:bg-accent rounded-md p-2 -ml-2 transition-colors w-full text-left"
                  >
                    <span className="text-primary">
                      {TYPE_ICONS[node.type.toLowerCase()] || <ChevronRight className="h-4 w-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">
                        {node.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {node.properties?.description
                          ? String(node.properties.description).slice(0, 100)
                          : node.type}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {node.type}
                    </Badge>
                  </button>
                </div>
              ))}
              {narrative.graph.nodes.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{narrative.graph.nodes.length - 5}개의 엔티티가 더 있습니다
                </p>
              )}
            </div>
          )}

          {/* Relationship Summary */}
          {narrative.graph && narrative.graph.edges.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">연결 관계</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(narrative.graph.edges.map(e => e.label))).slice(0, 6).map(label => (
                  <Badge key={label} variant="secondary" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {narrative.sources && narrative.sources.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">출처</p>
              <div className="flex flex-wrap gap-1">
                {narrative.sources.map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() => source.id && onEntityClick?.(String(source.id))}
                    className="text-xs bg-muted hover:bg-accent px-2 py-1 rounded transition-colors"
                  >
                    {String(source.name || source.id)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Processing Info */}
          <p className="text-xs text-muted-foreground text-right">
            {narrative.processing_time_ms.toFixed(0)}ms
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  return (
    <Card className={className}>
      <CardContent className="py-12 text-center">
        <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-muted-foreground">
          엔티티를 선택하거나 질문을 입력하면
          <br />
          스토리가 표시됩니다
        </p>
      </CardContent>
    </Card>
  );
}
