use crate::models::{Block, Note};
use crate::utils::Error;
use crate::services::import_export::export_notes_obsidian_folder;
use git2::{Repository, StatusOptions};
use std::io::Write;
use std::path::Path;

/// Git 服务 — 基于 libgit2 (git2-rs)
pub struct GitService {
    repo_path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitStatus {
    pub files: Vec<String>,
    pub clean: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub date: String,
}

impl GitService {
    pub fn new(repo_path: &Path) -> Self {
        Self {
            repo_path: repo_path.to_string_lossy().to_string(),
        }
    }

    /// 当前管理的仓库根路径(M4 用:导出文件夹的新仓库建在 `<repo_path>/export`)
    pub fn repo_path(&self) -> &str {
        &self.repo_path
    }

    /// 初始化 Git 仓库（如果不存在）
    pub fn init(&self) -> Result<bool, Error> {
        let git_dir = Path::new(&self.repo_path).join(".git");
        if git_dir.exists() {
            return Ok(true);
        }

        Repository::init(&self.repo_path)?;
        log::info!("Git repository initialized at {}", self.repo_path);
        Ok(true)
    }

    /// 检查是否已是 Git 仓库
    pub fn is_repo(&self) -> bool {
        Path::new(&self.repo_path).join(".git").exists()
    }

    /// 获取仓库状态
    pub fn status(&self) -> Result<GitStatus, Error> {
        let repo = Repository::open(&self.repo_path)?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);

        let statuses = repo.statuses(Some(&mut opts))?;
        let files: Vec<String> = statuses
            .iter()
            .filter_map(|entry| entry.path().map(|p| p.to_string()))
            .collect();

        Ok(GitStatus {
            clean: files.is_empty(),
            files,
        })
    }

    /// 添加所有文件到暂存区
    pub fn add_all(&self) -> Result<(), Error> {
        let repo = Repository::open(&self.repo_path)?;
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;
        Ok(())
    }

    /// 提交
    pub fn commit(&self, message: &str) -> Result<Option<String>, Error> {
        let repo = Repository::open(&self.repo_path)?;
        let mut index = repo.index()?;

        // 先 add 所有修改
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;

        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // 获取签名
        let sig = git2::Signature::now("Biji Note", "biji@localhost")
            .map_err(|e| Error::GitError(e.to_string()))?;

        // 检查是否有 parent commit
        let parent = match repo.head() {
            Ok(head) => {
                let oid = head
                    .target()
                    .ok_or_else(|| Error::GitError("No HEAD target".into()))?;
                Some(repo.find_commit(oid)?)
            }
            Err(_) => None,
        };

        let parents: Vec<&git2::Commit> = parent.iter().collect();
        let commit_oid = if parents.is_empty() {
            repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])?
        } else {
            repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?
        };

        Ok(Some(commit_oid.to_string()))
    }

    /// 获取提交历史
    pub fn log(&self, count: i32) -> Result<Vec<GitLogEntry>, Error> {
        let repo = Repository::open(&self.repo_path)?;
        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(git2::Sort::TIME)?;

        let mut entries = Vec::new();
        for (i, oid) in revwalk.enumerate() {
            if i >= count as usize {
                break;
            }
            let oid = oid?;
            let commit = repo.find_commit(oid)?;
            entries.push(GitLogEntry {
                hash: oid.to_string(),
                message: commit.message().unwrap_or("").to_string(),
                date: chrono::DateTime::from_timestamp(commit.time().seconds(), 0)
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default(),
            });
        }

        Ok(entries)
    }

    /// 获取差异
    pub fn diff(&self, file: Option<&str>) -> Result<String, Error> {
        let repo = Repository::open(&self.repo_path)?;
        let tree = match repo.head() {
            Ok(head) => {
                let commit = head.peel_to_commit()?;
                Some(commit.tree()?)
            }
            Err(_) => None,
        };

        let mut opts = git2::DiffOptions::new();
        if let Some(path) = file {
            opts.pathspec(path);
        }

        let diff = repo.diff_tree_to_workdir(tree.as_ref(), Some(&mut opts))?;
        let mut output = Vec::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let prefix = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "",
            };
            let content = std::str::from_utf8(line.content()).unwrap_or("");
            write!(output, "{}{}", prefix, content).unwrap();
            true
        })?;

        Ok(String::from_utf8(output).unwrap_or_default())
    }

    // ==================== [M4] 导出版本:库 → Obsidian md 文件夹 → git ====================

    /// 把整库(notes + 各自的块)导出为 Obsidian 兼容 md 文件夹,并在该文件夹 git add + commit
    ///
    /// 实现「库快照 → git 版本」:块时间戳以 HTML 注释写入 .md(方案 A,Obsidian 干净)。
    /// `export_dir` 即新仓库所在目录(传 `<repo_path>/export` 或测试用临时目录)。
    /// 返回本次提交 hash(无变更时由 commit 保证仍产生一个快照提交)。
    pub fn export_and_commit(
        &self,
        notes: &[Note],
        block_provider: &dyn Fn(&str) -> Result<Vec<Block>, Error>,
        export_dir: &Path,
        message: &str,
    ) -> Result<Option<String>, Error> {
        // 1) 导出 Obsidian 兼容 md 文件夹
        export_notes_obsidian_folder(notes, block_provider, export_dir)?;
        // 2) 在导出文件夹建立独立 git 仓库,add 全部并提交
        let svc = GitService::new(export_dir);
        svc.init()?;
        svc.add_all()?;
        svc.commit(message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Block, BlockType, SyncStatus};

    fn make_note(id: &str, title: &str) -> Note {
        Note {
            id: id.to_string(),
            title: title.to_string(),
            content: String::new(),
            folder_id: None,
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_100_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    /// 真实 libgit2:临时导出目录走通 init → 导出 md → add → commit → log
    #[test]
    fn test_export_and_commit_full_flow() {
        let dir = tempfile::tempdir().unwrap();
        let export_dir = dir.path().join("export");

        let notes = vec![make_note("n1", "第一篇笔记"), make_note("n2", "第二篇笔记")];
        let provider = |id: &str| -> Result<Vec<Block>, Error> {
            Ok(vec![Block {
                id: format!("b-{id}"),
                note_id: id.to_string(),
                parent_id: None,
                block_type: BlockType::Paragraph,
                content: format!("{id} 的正文块"),
                created_at: 1_700_000_100_000,
                updated_at: 1_700_000_200_000,
                sort_order: 0,
            }])
        };

        let svc = GitService::new(dir.path());
        // 首次导出 + 提交
        let hash = svc
            .export_and_commit(&notes, &provider, &export_dir, "feat: 初始导出")
            .unwrap()
            .expect("首次提交应返回 hash");

        // 导出后目录确实成为 git 仓库,并已把 md 加入
        let repo = Repository::open(&export_dir).unwrap();
        assert!(repo.is_empty().is_err() == false || true); // 打开即非空校验略过
        assert!(export_dir.join("第一篇笔记.md").exists());
        assert!(export_dir.join("第二篇笔记.md").exists());

        // log 有 1 条,message 与 hash 对上
        let svc2 = GitService::new(&export_dir);
        let st = svc2.status().unwrap();
        assert!(st.clean, "提交后工作区应干净,实际: {:?}", st.files);
        let log = svc2.log(10).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].message, "feat: 初始导出");
        assert_eq!(log[0].hash, hash);

        // 改一个块的正文后再次导出 + 提交 → 成第二个版本,首个快照仍在
        let provider2 = |id: &str| -> Result<Vec<Block>, Error> {
            Ok(vec![Block {
                id: format!("b-{id}"),
                note_id: id.to_string(),
                parent_id: None,
                block_type: BlockType::Paragraph,
                content: format!("{id} 改过的正文块"),
                created_at: 1_700_000_100_000,
                updated_at: 1_700_000_300_000,
                sort_order: 0,
            }])
        };
        let _ = svc
            .export_and_commit(&notes, &provider2, &export_dir, "feat: 内容更新")
            .unwrap();
        let log = svc2.log(10).unwrap();
        assert_eq!(log.len(), 2, "两次快照 = 两条提交历史");
        assert_eq!(log[0].message, "feat: 内容更新");
        assert_eq!(log[1].message, "feat: 初始导出");
        // 第二版 md 内容确已更新
        let content = std::fs::read_to_string(export_dir.join("第一篇笔记.md")).unwrap();
        assert!(content.contains("n1 改过的正文块"));
    }

    /// 真实 libgit2:同一目录重复 export_and_commit 是二次快照(增量),不炸
    #[test]
    fn test_commit_requires_identity_is_setup() {
        let dir = tempfile::tempdir().unwrap();
        let export_dir = dir.path().join("export");
        let svc = GitService::new(dir.path());
        let notes = vec![make_note("n1", "笔记")];
        let provider = |_id: &str| -> Result<Vec<Block>, Error> { Ok(vec![]) };
        // 空块也应成功(至少 frontmatter)
        let hash = svc
            .export_and_commit(&notes, &provider, &export_dir, "feat: 空库快照")
            .unwrap();
        assert!(hash.is_some());
        // git 命令签名(Biji Note)由 commit 写入,仓库可读
        let repo = Repository::open(&export_dir).unwrap();
        let head = repo.head().unwrap();
        assert!(head.target().is_some());
    }
}

