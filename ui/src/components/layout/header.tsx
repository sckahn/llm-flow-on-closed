'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const pageTitles: Record<string, string> = {
  '/apps': 'Apps',
  '/workflows': 'Workflows',
  '/datasets': 'Datasets',
  '/settings': 'Settings',
};

interface HeaderProps {
  onCreateClick?: () => void;
  showCreate?: boolean;
  createLabel?: string;
}

export function Header({ onCreateClick, showCreate = true, createLabel = 'Create' }: HeaderProps) {
  const pathname = usePathname();

  // Get the base path for title
  const basePath = '/' + pathname.split('/')[1];
  const title = pageTitles[basePath] || 'Dashboard';

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-64 pl-9"
          />
        </div>

        {showCreate && (
          <Button onClick={onCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            {createLabel}
          </Button>
        )}
      </div>
    </header>
  );
}
