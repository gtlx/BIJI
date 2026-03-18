import * as crypto from 'crypto';

/**
 * 加密服务 - 使用 AES-256-GCM 算法提供数据加密功能
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;

  /**
   * 创建加密服务实例
   * @param key 32字节的十六进制密钥，默认为随机生成
   */
  constructor(key?: string) {
    this.key = key 
      ? Buffer.from(key, 'hex')
      : crypto.randomBytes(32);
  }

  /**
   * 加密文本
   * @param text 要加密的明文
   * @returns 格式为 iv:authTag:ciphertext 的加密字符串
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密文本
   * @param encryptedText 加密字符串，格式为 iv:authTag:ciphertext
   * @returns 解密后的明文
   * @throws 如果格式无效则抛出错误
   */
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    
    const [ivHex, authTagHex, encrypted] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  getKey(): string {
    return this.key.toString('hex');
  }

  setKey(keyHex: string): void {
    this.key = Buffer.from(keyHex, 'hex');
  }
}
