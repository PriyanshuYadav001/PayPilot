import React from 'react';

interface GenericPageProps {
  page: string;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
}

export const GenericPage: React.FC<GenericPageProps> = ({ page, query, setQuery }) => {
  return (
    <div className="p-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <h1 className="font-display font-semibold text-2xl text-foreground">{page}</h1>
        <p className="text-sm text-muted-foreground">Page: {page}</p>
        <div className="mt-4">
          <span className="text-sm text-muted-foreground">Query: </span>
          <span className="ml-2 text-medium">{query || '—'}</span>
        </div>
      </div>
    </div>
  );
};