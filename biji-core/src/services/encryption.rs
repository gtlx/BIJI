use crate::utils::Error;
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};

/// 加密服务 — AES-256-GCM
pub struct EncryptionService {
    key: Vec<u8>,
}

impl EncryptionService {
    /// 创建加密服务
    /// key: 32 字节的密钥（十六进制字符串），为空则自动生成
    pub fn new(key_hex: &str) -> Self {
        let key = if key_hex.is_empty() {
            // 生成随机密钥
            let key_bytes = aes_gcm::Aes256Gcm::generate_key(OsRng);
            key_bytes.to_vec()
        } else {
            hex::decode(key_hex).unwrap_or_else(|_| {
                let key_bytes = aes_gcm::Aes256Gcm::generate_key(OsRng);
                key_bytes.to_vec()
            })
        };

        Self { key }
    }

    /// 加密文本
    /// 返回格式: iv(hex):auth_tag(hex):ciphertext(hex)
    pub fn encrypt(&self, text: &str) -> Result<String, Error> {
        let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&self.key);
        let cipher = Aes256Gcm::new(key);

        let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 12 字节
        let ciphertext = cipher
            .encrypt(&nonce, text.as_bytes())
            .map_err(|e| Error::EncryptionError(e.to_string()))?;

        Ok(format!(
            "{}:{}",
            hex::encode(nonce),
            hex::encode(ciphertext)
        ))
    }

    /// 解密文本
    /// 输入格式: iv(hex):auth_tag_ciphertext(hex)
    pub fn decrypt(&self, encrypted: &str) -> Result<String, Error> {
        let parts: Vec<&str> = encrypted.splitn(2, ':').collect();
        if parts.len() != 2 {
            return Err(Error::EncryptionError(
                "Invalid encrypted text format".into(),
            ));
        }

        let nonce_bytes = hex::decode(parts[0])
            .map_err(|e| Error::EncryptionError(format!("Invalid IV hex: {}", e)))?;
        let ciphertext = hex::decode(parts[1])
            .map_err(|e| Error::EncryptionError(format!("Invalid ciphertext hex: {}", e)))?;

        let key = aes_gcm::Key::<Aes256Gcm>::from_slice(&self.key);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| Error::EncryptionError(format!("Decryption failed: {}", e)))?;

        Ok(String::from_utf8(plaintext)
            .map_err(|e| Error::EncryptionError(format!("Invalid UTF-8: {}", e)))?)
    }

    /// 获取当前密钥（十六进制）
    pub fn get_key_hex(&self) -> String {
        hex::encode(&self.key)
    }
}
