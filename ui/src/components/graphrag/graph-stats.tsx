'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Users, Link2, Layers, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getGraphStats } from '@/lib/api/graphrag';

interface GraphStatsProps {
  datasetId?: string;
  className?: string;
}

interface Stats {
  total_entities: number;
  total_relationships: number;
  type_distribution: Array<{ type: string; count: number; color: string }>;
  avg_connections: number;
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
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '통계를 불러오는 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {[1, 2, 3, 4].map(i => (
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

  const maxTypeCount = Math.max(...(stats.type_distribution?.map(t => t.count) || [1]));

  return (
    <div className={className}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              엔티티
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_entities.toLocaleString()}</p>
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
            <p className="text-2xl font-bold">{stats.total_relationships.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Layers className="h-4 w-4" />
              유형 수
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.type_distribution?.length || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              평균 연결
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avg_connections?.toFixed(1) || '0'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Type Distribution */}
      {stats.type_distribution && stats.type_distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              엔티티 유형 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.type_distribution.map((item) => (
                <div key={item.type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="capitalize">{item.type}</span>
                    </div>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <Progress
                    value={(item.count / maxTypeCount) * 100}
                    className="h-2"
                    style={{
                      '--progress-background': item.color,
                    } as React.CSSProperties}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
