use biji_core::App;
use biji_core::models::*;
use std::sync::Arc;

fn test_app() -> (tempfile::TempDir, Arc<biji_core::database::Database>) {
    let dir = tempfile::tempdir().unwrap();
    let app = App::init(dir.path()).unwrap();
    let _ = &app; // keep app alive
    (dir, app.db.clone())
}

mod note_tests {
    use super::*;

    fn make_note(title: &str) -> Note {
        Note {
            id: uuid::Uuid::new_v4().to_string(),
            title: title.into(),
            content: format!("# {}\n\n这是内容", title),
            folder_id: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            updated_at: chrono::Utc::now().timestamp_millis(),
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    #[test]
    fn test_create_and_get_note() {
        let (_dir, db) = test_app();
        let note = make_note("测试笔记");
        db.save_note(&note).unwrap();

        let notes = db.get_all_notes(false).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "测试笔记");

        let fetched = db.get_note(&note.id).unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().title, "测试笔记");
    }

    #[test]
    fn test_update_note() {
        let (_dir, db) = test_app();
        let mut note = make_note("原标题");
        db.save_note(&note).unwrap();

        note.title = "新标题".into();
        note.content = "更新后的内容".into();
        db.save_note(&note).unwrap();

        let fetched = db.get_note(&note.id).unwrap().unwrap();
        assert_eq!(fetched.title, "新标题");
        assert_eq!(fetched.content, "更新后的内容");
    }

    #[test]
    fn test_delete_and_restore_note() {
        let (_dir, db) = test_app();
        let note = make_note("要删除的笔记");
        db.save_note(&note).unwrap();

        db.delete_note(&note.id, false).unwrap();
        let notes = db.get_all_notes(false).unwrap();
        assert_eq!(notes.len(), 0);

        db.restore_note(&note.id).unwrap();
        let notes = db.get_all_notes(false).unwrap();
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn test_permanent_delete() {
        let (_dir, db) = test_app();
        let note = make_note("永久删除");
        db.save_note(&note).unwrap();

        db.delete_note(&note.id, true).unwrap();
        let notes = db.get_all_notes(true).unwrap();
        assert_eq!(notes.len(), 0);
    }

    #[test]
    fn test_get_all_notes_with_deleted() {
        let (_dir, db) = test_app();
        db.save_note(&make_note("笔记1")).unwrap();
        db.save_note(&make_note("笔记2")).unwrap();
        let note3 = make_note("笔记3");
        db.save_note(&note3).unwrap();
        db.delete_note(&note3.id, false).unwrap();

        let active = db.get_all_notes(false).unwrap();
        assert_eq!(active.len(), 2);

        let all = db.get_all_notes(true).unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_search_notes() {
        let (_dir, db) = test_app();
        let mut n1 = make_note("Rust 学习笔记");
        n1.tags = vec!["rust".into(), "编程".into()];
        db.save_note(&n1).unwrap();
        db.save_note(&make_note("Python 学习")).unwrap();

        let results = db.search_notes(&SearchQuery {
            keyword: Some("Rust".into()),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust 学习笔记");
    }

    #[test]
    fn test_search_by_tag() {
        let (_dir, db) = test_app();
        let mut n1 = make_note("Rust 笔记");
        n1.tags = vec!["rust".into()];
        db.save_note(&n1).unwrap();

        let results = db.search_notes(&SearchQuery {
            tags: Some(vec!["rust".into()]),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 1);
    }
}

mod folder_tests {
    use super::*;

    #[test]
    fn test_create_folder() {
        let (_dir, db) = test_app();
        let folder = Folder {
            id: uuid::Uuid::new_v4().to_string(),
            name: "工作".into(),
            parent_id: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            color: None,
            deleted_at: None,
        };
        db.save_folder(&folder).unwrap();

        let folders = db.get_all_folders(false).unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "工作");
    }

    #[test]
    fn test_folder_hierarchy() {
        let (_dir, db) = test_app();
        let parent = Folder {
            id: "p1".into(), name: "学习".into(), parent_id: None,
            created_at: 0, color: None, deleted_at: None,
        };
        let child = Folder {
            id: "c1".into(), name: "Rust".into(), parent_id: Some("p1".into()),
            created_at: 0, color: None, deleted_at: None,
        };
        db.save_folder(&parent).unwrap();
        db.save_folder(&child).unwrap();

        let folders = db.get_all_folders(false).unwrap();
        assert_eq!(folders.len(), 2);
    }

    #[test]
    fn test_delete_folder_moves_notes() {
        let (_dir, db) = test_app();
        let folder = Folder {
            id: "f1".into(), name: "项目".into(), parent_id: None,
            created_at: 0, color: None, deleted_at: None,
        };
        db.save_folder(&folder).unwrap();

        let mut note = make_note("项目笔记");
        note.folder_id = Some("f1".into());
        db.save_note(&note).unwrap();

        db.delete_folder("f1", false).unwrap();
        let fetched = db.get_note(&note.id).unwrap().unwrap();
        assert_eq!(fetched.folder_id, None);
    }
}

mod wikilink_tests {
    use super::*;

    #[test]
    fn test_parse_wikilinks_in_note() {
        let (_dir, db) = test_app();
        let mut note = make_note("链接测试");
        note.content = "参考 [[笔记A]] 和 [[笔记B]] 的内容".into();
        db.save_note(&note).unwrap();

        // 保存后检查 links 表
        let links = db.get_all_links().unwrap();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target_title, "笔记A");
        assert_eq!(links[1].target_title, "笔记B");
    }

    #[test]
    fn test_update_links() {
        let (_dir, db) = test_app();
        let mut note = make_note("更新链接");
        note.content = "[[旧链接]]".into();
        db.save_note(&note).unwrap();

        note.content = "[[新链接]]".into();
        db.save_note(&note).unwrap();

        let links = db.get_all_links().unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target_title, "新链接");
    }
}

mod graph_tests {
    use super::*;

    #[test]
    fn test_graph_data() {
        let (_dir, db) = test_app();
        let mut a = make_note("笔记A");
        a.content = "链接到 [[笔记B]]".into();
        let mut b = make_note("笔记B");
        b.content = "链接到 [[笔记A]]".into();
        db.save_note(&a).unwrap();
        db.save_note(&b).unwrap();

        let graph = db.get_graph_data().unwrap();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 2);
    }
}

mod pending_sync_tests {
    use super::*;

    #[test]
    fn test_pending_sync_notes() {
        let (_dir, db) = test_app();
        let mut note = make_note("待同步");
        note.sync_status = SyncStatus::Pending;
        db.save_note(&note).unwrap();

        let pending = db.get_pending_sync_notes().unwrap();
        assert_eq!(pending.len(), 1);

        db.mark_synced(&[note.id.clone()]).unwrap();
        let pending = db.get_pending_sync_notes().unwrap();
        assert_eq!(pending.len(), 0);
    }
}
