import { useState } from 'react';
import type { Folder, Note, TagCount } from '../api/backend';
import { StrokeIcon } from '../icons';
import './Sidebar.css';

/** 应用导航项(桌面左侧栏 / 移动端底部 Tab 栏共用概念) */
export interface SidebarNavItem {
  id: string;
  icon: string;
  label: string;
}

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onOpenSettings: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  /** 应用导航:笔记/搜索/图谱/Git/发布/插件 */
  navItems: SidebarNavItem[];
  /** 当前激活的导航 id(高亮显示) */
  activeNav: string;
  onNavClick: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** [M3.5a 标签树] 全部标签及计数 */
  tags?: TagCount[];
  /** [M3.5a 标签树] 已选标签(过滤笔记列表) */
  selectedTag?: string | null;
  /** [M3.5a 标签树] 点标签 → 过滤 NoteList */
  onSelectTag?: (tag: string | null) => void;
  /** [M3.5a 标签树] 全量笔记(展开标签下笔记用) */
  notes?: Note[];
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function Sidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onOpenSettings,
  onNewNote,
  onNewFolder,
  navItems,
  activeNav,
  onNavClick,
  collapsed = false,
  onToggleCollapse,
  tags = [],
  selectedTag = null,
  onSelectTag,
  notes = [],
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  /** [M3.5a] 展开的标签(显示其下笔记) */
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const buildBreadcrumb = (folderId: string | null): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [{ id: null, name: '所有笔记' }];
    if (folderId) {
      const path: BreadcrumbItem[] = [];
      let current = folders.find(f => f.id === folderId);
      while (current) {
        path.unshift({ id: current.id, name: current.name });
        current = current.parent_id ? folders.find(f => f.id === current!.parent_id) : undefined;
      }
      items.push(...path);
    }
    return items;
  };

  const breadcrumb = buildBreadcrumb(selectedFolderId);
  const subFolders = folders.filter(f => f.parent_id === selectedFolderId);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 品牌区 */}
      <div className="brand">
        <span className="brand-mark">笔</span>
        {!collapsed && <span className="brand-name">Biji Note</span>}
      </div>

      {/* 折叠开关(桌面) */}
      <button
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        title={collapsed ? '展开侧栏' : '折叠侧栏'}
      >
        <StrokeIcon name={collapsed ? 'back' : 'outline'} size={16} />
      </button>

      {/* 应用导航:图标 + 文字,激活项 teal 高亮 */}
      <nav className="side-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`side-nav-item ${activeNav === item.id ? 'active' : ''}`}
            onClick={() => onNavClick(item.id)}
            title={item.label}
          >
            <StrokeIcon name={item.icon} size={18} />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 文件夹导航(折叠时隐藏) */}
      {!collapsed && (
        <div className="sidebar-nav">
          {breadcrumb.length > 1 && (
            <div className="breadcrumb">
              {breadcrumb.map((item, index) => (
                <span key={item.id ?? 'root'}>
                  {index > 0 && <span className="breadcrumb-sep">/</span>}
                  <button
                    className={`breadcrumb-item ${item.id === selectedFolderId ? 'active' : ''}`}
                    onClick={() => onSelectFolder(item.id)}
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="nav-section">
            <div className="nav-section-header">
              <span className="nav-section-title">{selectedFolderId ? '子文件夹' : '文件夹'}</span>
              <button className="nav-action-btn" onClick={onNewFolder} title="新建文件夹">
                <StrokeIcon name="plus" size={15} />
              </button>
            </div>
            {subFolders.length > 0 ? (
              subFolders.map(folder => (
                <button
                  key={folder.id}
                  className="nav-item"
                  onClick={() => onSelectFolder(folder.id)}
                  onDoubleClick={() => toggleFolder(folder.id)}
                >
                  <StrokeIcon name="folder" size={18} />
                  <span>{folder.name}</span>
                </button>
              ))
            ) : (
              <p className="empty-text">暂无文件夹</p>
            )}
          </div>

          {/* [M3.5a] 标签区:列出标签,点击过滤笔记列表;可展开标签下笔记 */}
          <div className="nav-section">
            <div className="nav-section-header">
              <span className="nav-section-title">标签</span>
            </div>
            {tags.length === 0 ? (
              <p className="empty-text">暂无标签</p>
            ) : (
              tags.map(tag => {
                const isOpen = expandedTag === tag.name;
                const tagNotes = notes.filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === tag.name.toLowerCase()));
                return (
                  <div key={tag.name} className="tag-group">
                    <button
                      className={`nav-item tag-item ${selectedTag === tag.name ? 'active' : ''}`}
                      onClick={() => {
                        // 再点已展开标签 = 取消过滤 + 收起
                        if (selectedTag === tag.name) { onSelectTag?.(null); setExpandedTag(null); return; }
                        onSelectTag?.(tag.name);
                        setExpandedTag(isOpen ? null : tag.name);
                      }}
                      title={tag.name}
                    >
                      <span className="tree-chevron">
                        <StrokeIcon name={isOpen ? 'chevron_down' : 'chevron_right'} size={13} />
                      </span>
                      <StrokeIcon name="tag" size={16} />
                      <span className="tag-name">{tag.name}</span>
                      <span className="tree-count">{tag.count}</span>
                    </button>
                    {isOpen && (
                      <div className="tag-notes">
                        {tagNotes.length === 0 ? (
                          <p className="empty-text">该标签下暂无笔记</p>
                        ) : (
                          tagNotes.map(n => (
                            <button
                              key={n.id}
                              className="nav-item tag-note"
                              onClick={() => onSelectTag?.(tag.name)}
                              title={n.title}
                            >
                              <span className="tag-note-title">{n.title || '无标题'}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 底部:新建笔记 + 设置 */}
      <div className="sidebar-footer">
        <button className="btn sidebar-new-btn" onClick={onNewNote}>
          <StrokeIcon name="plus" size={16} />
          {!collapsed && <span>新建笔记</span>}
        </button>
        <button
          className={`nav-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={onOpenSettings}
        >
          <StrokeIcon name="settings" size={18} />
          {!collapsed && <span>设置</span>}
        </button>
      </div>
    </aside>
  );
}
