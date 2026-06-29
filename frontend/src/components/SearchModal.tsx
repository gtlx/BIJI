import { useState } from 'react';
import type { Note } from '../api/backend';
import './SearchModal.css';

interface SearchModalProps {
  notes: Note[];
  onClose: () => void;
  onSelectNote: (note: Note) => void;
}

export function SearchModal({ notes, onClose, onSelectNote }: SearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const results = keyword
    ? notes.filter(n => n.title.includes(keyword) || n.content.includes(keyword))
    : notes;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <input type="text" className="search-input" value={keyword}
            onChange={e => setKeyword(e.target.value)} placeholder="搜索笔记..." autoFocus />
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="search-results">
          {results.map(note => (
            <div key={note.id} className="search-result-item" onClick={() => onSelectNote(note)}>
              <div className="search-result-title">{note.title}</div>
              <div className="search-result-preview">{note.content.slice(0, 100)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
