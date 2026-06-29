import { useState, useEffect, useCallback } from 'react';
import { backend } from './api';
import type { Note, Folder, AppSettings, SearchQuery, Plugin } from './api/backend';
import { DEFAULT_TEMPLATES } from './api/backend';
import './App.css';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showGraph, setShowGraph] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData, pluginsData] = await Promise.all([
        backend.getNotes(),
        backend.getFolders(),
        backend.getSettings(),
        backend.getPlugins(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
      setPlugins(pluginsData);
      applyTheme(settingsData.theme);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyTheme = (theme: string) => {
    let isDark = false;
    if (theme === 'dark') isDark = true;
    else if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNewNote = async () => {
    const template = DEFAULT_TEMPLATES.find(t => t.id === settings?.template || 'blank');
    let content = template?.content || '';
    if (template?.id === 'daily') {
      const today = new Date().toLocaleDateString('zh-CN');
      content = content.replace('{{date}}', today);
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '无标题',
      content,
      created_at: Date.now(),
      updated_at: Date.now(),
      tags: [],
      folder_id: selectedFolderId,
      is_encrypted: false,
      sync_status: 'pending',
    };
    await backend.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
  };

  const handleSaveNote = async (note: Note) => {
    const updated = { ...note, updated_at: Date.now(), sync_status: 'pending' as const };
    await backend.saveNote(updated);
    setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
    setSelectedNote(updated);
  };

  const handleDeleteNote = async (id: string) => {
    await backend.deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  const handleSearch = async (query: SearchQuery) => {
    const results = await backend.searchNotes(query);
    setNotes(results);
  };

  const handleSettingsChange = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    await backend.setSettings(updated);
    setSettings(updated);
    if (patch.theme) applyTheme(patch.theme);
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="app-container">
      {/* 三栏布局骨架 — 实际组件从原项目迁移 */}
      <div className="sidebar">
        <div className="sidebar-header">
          <button onClick={handleNewNote}>+ 新建笔记</button>
        </div>
        <div className="folder-list">
          <div className="folder-item" onClick={() => setSelectedFolderId(null)}>
            📁 所有笔记 ({notes.length})
          </div>
          {folders.map(f => (
            <div
              key={f.id}
              className={`folder-item ${selectedFolderId === f.id ? 'active' : ''}`}
              onClick={() => setSelectedFolderId(f.id)}
            >
              📁 {f.name}
            </div>
          ))}
        </div>
      </div>

      <div className="note-list">
        <div className="note-list-header">
          <input
            type="text"
            placeholder="搜索..."
            onChange={e => {
              if (e.target.value) handleSearch({ keyword: e.target.value });
              else loadData();
            }}
          />
        </div>
        {notes
          .filter(n => !selectedFolderId || n.folder_id === selectedFolderId)
          .map(note => (
            <div
              key={note.id}
              className={`note-item ${selectedNote?.id === note.id ? 'active' : ''}`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="note-title">{note.title}</div>
              <div className="note-preview">{note.content.slice(0, 80)}</div>
            </div>
          ))}
      </div>

      <div className="main-content">
        {selectedNote ? (
          <div className="editor">
            <input
              className="editor-title"
              value={selectedNote.title}
              onChange={e => setSelectedNote({ ...selectedNote, title: e.target.value })}
              onBlur={() => handleSaveNote(selectedNote)}
              placeholder="笔记标题"
            />
            <textarea
              className="editor-content"
              value={selectedNote.content}
              onChange={e => setSelectedNote({ ...selectedNote, content: e.target.value })}
              onBlur={() => handleSaveNote(selectedNote)}
              placeholder="开始写作..."
            />
            <div className="editor-footer">
              <button onClick={() => handleDeleteNote(selectedNote.id)} className="btn-delete">
                删除
              </button>
            </div>
          </div>
        ) : showGraph ? (
          <div className="graph-placeholder">
            <p>知识图谱（需集成 D3.js）</p>
          </div>
        ) : (
          <div className="empty-state">
            <p>选择一篇笔记开始编辑</p>
          </div>
        )}
      </div>

      <div className="right-panel">
        <h3>大纲</h3>
        {selectedNote && (
          <div className="outline">
            <p>笔记属性</p>
            <p>标签: {selectedNote.tags.join(', ') || '无'}</p>
            <p>字数: {selectedNote.content.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
