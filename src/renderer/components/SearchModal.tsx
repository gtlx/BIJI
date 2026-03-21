import { useState, useEffect, useMemo } from 'react';
import type { Note } from '@shared/types';
import './SearchModal.css';

interface SearchModalProps {
  onClose: () => void;
  onSelectNote: (note: Note) => void;
  notes: Note[];
}

interface SearchResult {
  note: Note;
  matchType: 'title' | 'content' | 'both';
  matchText: string;
  highlightIndex: number;
}

export function SearchModal({ onClose, onSelectNote, notes }: SearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'title' | 'content'>('all');

  const searchResults = useMemo(() => {
    if (!keyword.trim()) return [];
    
    const query = keyword.toLowerCase();
    const found: SearchResult[] = [];
    
    for (const note of notes) {
      const titleMatch = note.title.toLowerCase().includes(query);
      const contentMatch = note.content.toLowerCase().includes(query);
      
      if (titleMatch || contentMatch) {
        let matchText = '';
        let highlightIndex = 0;
        
        if (titleMatch) {
          matchText = note.title;
          highlightIndex = note.title.toLowerCase().indexOf(query);
        } else {
          const index = note.content.toLowerCase().indexOf(query);
          const start = Math.max(0, index - 20);
          const end = Math.min(note.content.length, index + query.length + 20);
          matchText = (start > 0 ? '...' : '') + note.content.slice(start, end) + (end < note.content.length ? '...' : '');
          highlightIndex = index - start + (start > 0 ? 3 : 0);
        }
        
        found.push({
          note,
          matchType: titleMatch && contentMatch ? 'both' : titleMatch ? 'title' : 'content',
          matchText,
          highlightIndex,
        });
      }
    }
    
    return found;
  }, [keyword, notes]);

  useEffect(() => {
    if (activeFilter === 'all') {
      setResults(searchResults);
    } else {
      setResults(searchResults.filter(r => r.matchType === activeFilter));
    }
  }, [searchResults, activeFilter]);

  const handleSelectNote = (note: Note) => {
    onSelectNote(note);
    onClose();
  };

  const titleResults = searchResults.filter(r => r.matchType === 'title' || r.matchType === 'both');
  const contentResults = searchResults.filter(r => r.matchType === 'content' || r.matchType === 'both');

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <mark className="search-highlight">{text.slice(index, index + query.length)}</mark>
        {text.slice(index + query.length)}
      </>
    );
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">搜索笔记</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body search-body">
          <div className="search-input-wrapper">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              className="search-input"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索笔记标题或内容..."
              autoFocus
            />
          </div>

          {keyword && (
            <div className="search-filters">
              <button 
                className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                全部 ({searchResults.length})
              </button>
              <button 
                className={`filter-btn ${activeFilter === 'title' ? 'active' : ''}`}
                onClick={() => setActiveFilter('title')}
              >
                标题 ({titleResults.length})
              </button>
              <button 
                className={`filter-btn ${activeFilter === 'content' ? 'active' : ''}`}
                onClick={() => setActiveFilter('content')}
              >
                内容 ({contentResults.length})
              </button>
            </div>
          )}

          <div className="search-results">
            {keyword && results.length === 0 && (
              <div className="search-empty">
                <p>未找到匹配的笔记</p>
              </div>
            )}
            
            {!keyword && (
              <div className="search-empty">
                <p>输入关键词搜索笔记</p>
              </div>
            )}
            
            {results.map((result) => (
              <button
                key={result.note.id}
                className="search-result-item"
                onClick={() => handleSelectNote(result.note)}
              >
                <div className="result-header">
                  <span className="result-title">{highlightMatch(result.note.title, keyword)}</span>
                  <span className={`result-badge ${result.matchType}`}>
                    {result.matchType === 'title' ? '标题' : result.matchType === 'content' ? '内容' : '标题+内容'}
                  </span>
                </div>
                <div className="result-preview">
                  {highlightMatch(result.matchText, keyword)}
                </div>
                <div className="result-meta">
                  <span className="result-date">{formatDate(result.note.updatedAt)}</span>
                  {result.note.tags.length > 0 && (
                    <div className="result-tags">
                      {result.note.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="tag">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
