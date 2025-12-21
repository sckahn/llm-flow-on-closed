'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Sparkles, History, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { askNaturalLanguage, getQuerySuggestions, NarrativeResponse } from '@/lib/api/graphrag';

interface NaturalQueryProps {
  datasetId?: string;
  onResultsChange?: (results: NarrativeResponse | null) => void;
  className?: string;
}

export function NaturalQuery({ datasetId, onResultsChange, className }: NaturalQueryProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<NarrativeResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load suggestions
  useEffect(() => {
    getQuerySuggestions(datasetId)
      .then(setSuggestions)
      .catch(console.error);
  }, [datasetId]);

  // Load recent queries from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('graphrag_recent_queries');
    if (saved) {
      setRecentQueries(JSON.parse(saved));
    }
  }, []);

  const saveToRecent = (q: string) => {
    const updated = [q, ...recentQueries.filter(r => r !== q)].slice(0, 5);
    setRecentQueries(updated);
    localStorage.setItem('graphrag_recent_queries', JSON.stringify(updated));
  };

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await askNaturalLanguage(searchQuery, {
        dataset_id: datasetId,
        include_narrative: true,
      });

      setResults(response);
      onResultsChange?.(response);
      saveToRecent(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다');
      setResults(null);
      onResultsChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [datasetId, onResultsChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  return (
    <div className={className}>
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="무엇이든 물어보세요... (예: '김철수와 관련된 문서는?')"
              className="pl-10 pr-4 h-12 text-base"
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="h-12 px-6"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                질문하기
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Suggestions */}
      {!results && suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">추천 질문:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recent Queries */}
      {!results && recentQueries.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
            <History className="h-3 w-3" />
            최근 질문:
          </p>
          <div className="space-y-1">
            {recentQueries.map((recent, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestionClick(recent)}
                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors flex items-center gap-2"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {recent}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 space-y-6">
          {/* Answer Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                답변
              </CardTitle>
              <CardDescription>
                처리 시간: {results.processing_time_ms.toFixed(0)}ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{results.answer}</p>
              </div>
            </CardContent>
          </Card>

          {/* Narrative Card */}
          {results.narrative && (
            <Card>
              <CardHeader>
                <CardTitle>스토리</CardTitle>
                <CardDescription>
                  그래프 관계를 기반으로 한 설명
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{results.narrative}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sources */}
          {results.sources && results.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>관련 엔티티</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {results.sources.map((source, idx) => (
                    <Badge key={idx} variant="secondary">
                      {String(source.name || source.id)}
                      {source.type ? (
                        <span className="ml-1 text-xs opacity-70">
                          ({String(source.type)})
                        </span>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cypher Query (for developers) */}
          {results.cypher_query && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                생성된 Cypher 쿼리 보기
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-md overflow-x-auto text-xs">
                {results.cypher_query}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
