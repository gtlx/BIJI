use thiserror::Error;

/// 统一错误类型
#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Git error: {0}")]
    GitError(String),

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("WebDAV error: {0}")]
    WebDAVError(String),

    #[error("Plugin error: {0}")]
    PluginError(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("General error: {0}")]
    General(String),
}

impl From<git2::Error> for Error {
    fn from(e: git2::Error) -> Self {
        Error::GitError(e.message().to_string())
    }
}

impl From<base64::DecodeError> for Error {
    fn from(e: base64::DecodeError) -> Self {
        Error::General(format!("Base64 decode error: {}", e))
    }
}

// 实现 serde::Serialize 让错误可以传给前端
impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
