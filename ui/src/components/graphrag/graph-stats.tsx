'use client';

import { useEffect, useState } from 'react';
import { Users, Link2, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getGraphStats } from '@/lib/api/graphrag';

interface GraphStatsProps {
  datasetId?: string;
  className?: string;
}

interface Stats {
  total_entities: number;
  total_relationships: number;
  total_vectors: number;
}

export function GraphStats({ datasetId, className }: GraphStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [datasetId]);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getGraphStats(datasetId);
      // Transform API response to Stats format
      type StatsResponse = {
        graph?: { entity_count?: number; relationship_count?: number };
        vector?: { total_entities?: number; count?: number };
      };
      const graphData = data as StatsResponse;
      setStats({
        total_entities: graphData.graph?.entity_count ?? 0,
        total_relationships: graphData.graph?.relationship_count ?? 0,
        total_vectors: graphData.vector?.total_entities ?? graphData.vector?.count ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '통계를 불러오는 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`grid grid-cols-3 gap-4 ${className}`}>
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className={`grid grid-cols-3 gap-4 ${className}`}>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            엔티티
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{(stats.total_entities ?? 0).toLocaleString()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Link2 className="h-4 w-4" />
            관계
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{(stats.total_relationships ?? 0).toLocaleString()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Database className="h-4 w-4" />
            벡터
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{(stats.total_vectors ?? 0).toLocaleString()}</p>
        </CardContent>
      </Card>
    </div>
  );
}
