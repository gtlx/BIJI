use crate::utils::Error;

/// WebDAV 客户端 — 基于 HTTP 请求实现
pub struct WebDAVClient {
    client: reqwest::blocking::Client,
    base_url: String,
    username: Option<String>,
    password: Option<String>,
}

impl WebDAVClient {
    pub fn new(url: &str, username: Option<&str>, password: Option<&str>) -> Self {
        let base_url = url.trim_end_matches('/').to_string();
        Self {
            client: reqwest::blocking::Client::new(),
            base_url,
            username: username.map(|s| s.to_string()),
            password: password.map(|s| s.to_string()),
        }
    }

    fn auth_header(&self) -> Option<String> {
        if let (Some(user), Some(pass)) = (&self.username, &self.password) {
            let encoded = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", user, pass),
            );
            Some(format!("Basic {}", encoded))
        } else {
            None
        }
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::blocking::RequestBuilder {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        let mut req = self.client.request(method, &url);
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        req
    }

    /// 确保远程目录存在（MKCOL）
    pub fn ensure_base_path(&self) -> Result<(), Error> {
        let resp = self
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), "/biji")
            .send()?;
        // 405 = 已存在，也是成功
        if resp.status().is_success() || resp.status().as_u16() == 405 {
            Ok(())
        } else {
            Err(Error::WebDAVError(format!(
                "Failed to create base path: {}",
                resp.status()
            )))
        }
    }

    /// 列出远程文件（PROPFIND）
    pub fn list_files(&self) -> Result<Vec<String>, Error> {
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
            <propfind xmlns="DAV:"><prop><displayname/></prop></propfind>"#;

        let resp = self
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), "/biji")
            .header("Content-Type", "application/xml")
            .body(body)
            .send()?;

        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let text = resp.text()?;
        let re = regex::Regex::new(r"<d:displayname>([^<]+)</d:displayname>").unwrap();
        let files: Vec<String> = re
            .captures_iter(&text)
            .map(|c| c[1].to_string())
            .filter(|name| !name.is_empty())
            .collect();

        Ok(files)
    }

    /// 上传文件（PUT）
    pub fn upload_file(&self, filename: &str, content: &str) -> Result<bool, Error> {
        let resp = self
            .request(reqwest::Method::PUT, &format!("/biji/{}", filename))
            .header("Content-Type", "application/octet-stream")
            .body(content.to_string())
            .send()?;

        Ok(resp.status().is_success()
            || resp.status().as_u16() == 201
            || resp.status().as_u16() == 204)
    }

    /// 下载文件（GET）
    pub fn download_file(&self, filename: &str) -> Result<Option<String>, Error> {
        let resp = self
            .request(reqwest::Method::GET, &format!("/biji/{}", filename))
            .send()?;

        if resp.status().is_success() {
            Ok(Some(resp.text()?))
        } else {
            Ok(None)
        }
    }

    /// 删除文件（DELETE）
    pub fn delete_file(&self, filename: &str) -> Result<bool, Error> {
        let resp = self
            .request(reqwest::Method::DELETE, &format!("/biji/{}", filename))
            .send()?;

        Ok(resp.status().is_success() || resp.status().as_u16() == 204)
    }

    /// 测试连接
    pub fn test_connection(&self) -> Result<bool, Error> {
        let resp = self
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), "/")
            .header("Content-Type", "application/xml")
            .body(r#"<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>"#)
            .send()?;

        Ok(resp.status().is_success())
    }
}
