use crate::utils::Error;
use git2::{Repository, StatusOptions};
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
}
