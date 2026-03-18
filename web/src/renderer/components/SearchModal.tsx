import React, { useState } from 'react';
import type { SearchQuery } from '@shared/types';
import './SearchModal.css';

interface SearchModalProps {
  onClose: () => void;
  onSearch: (query: SearchQuery) => void;
}

export function SearchModal({ onClose, onSearch }: SearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query: SearchQuery = {};
    if (keyword.trim()) {
      query.keyword = keyword.trim();
    }
    if (tags.length > 0) {
      query.tags = tags;
    }
    onSearch(query);
    onClose();
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
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

            <div className="search-tags">
              {tags.map(tag => (
                <span key={tag} className="tag">
                  {tag}
                  <button type="button" className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</button>
                </span>
              ))}
              <input
                type="text"
                className="tag-input"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="添加标签筛选..."
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary">搜索</button>
          </div>
        </form>
      </div>
    </div>
  );
}
