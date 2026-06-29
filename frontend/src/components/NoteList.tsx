import type { Note, SearchQuery } from '../api/backend';
import './NoteList.css';

interface NoteListProps {
  notes: Note[];
  selectedNoteId?: string;
  onSelectNote: (note: Note) => void;
  onNewNote: () => void;
  onSearch: (query: SearchQuery) => void;
}

export function NoteList({ 
  notes, 
  selectedNoteId, 
  onSelectNote, 
  onNewNote,
}: NoteListProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return date.toLocaleDateString('zh-CN', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  const getPreview = (content: string) => {
    const text = content.replace(/[#*_`~\[\]]/g, '').trim();
    return text.slice(0, 100) || '无内容';
  };

  return (
    <div className="note-list">
      <div className="note-list-header">
        <button className="btn btn-primary" onClick={onNewNote}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          新建笔记
        </button>
      </div>

      <div className="note-list-content">
        {notes.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
            </svg>
            <p>暂无笔记</p>
            <button className="btn btn-secondary" onClick={onNewNote}>
              创建第一篇笔记
            </button>
          </div>
        ) : (
          <div className="note-items">
            {notes.map(note => (
              <div
                key={note.id}
                className={`note-item ${selectedNoteId === note.id ? 'active' : ''}`}
                onClick={() => onSelectNote(note)}
              >
                <div className="note-item-header">
                  <h3 className="note-item-title">{note.title || '无标题'}</h3>
                  <span className="note-item-date">{formatDate(note.updated_at)}</span>
                </div>
                <p className="note-item-preview">{getPreview(note.content)}</p>
                {note.tags.length > 0 && (
                  <div className="note-item-tags">
                    {note.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
