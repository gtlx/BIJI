// ============================================================
// [zip 压缩打包] 极简 ZIP(STORE/仅存储,无压缩)编解码
// ------------------------------------------------------------
// 目标:笔记「导出/导入」支持 .zip 单文件(便于整库迁移备份)。
// 约束:前端不装 jszip 等新依赖;真实 zip 压缩(DEFLATE)与写盘
//       在 Tauri 壳(M6)由后端 zip crate 完成。
// 本模块是 web Mock 的纯前端最小实现:
//   - 导出:把笔记打包成**真实的 .zip**(每个条目用 STORE 方式,
//     零压缩直接存储),任何 zip 工具/系统都能打开。
//   - 导入:只解析本模块产出的 STORE 方式 zip;若遇到 DEFLATE
//     压缩条目(无法在无库前端解压),抛出明确错误提示走 Tauri 壳。
// 全程中文注释;STORE 方式无需压缩算法,CRC32 手写查表实现。
// ============================================================

export interface ZipEntry {
  /** 条目在压缩包内的相对路径,如 notes/2026-08-17.md */
  name: string;
  /** 条目原始字节 */
  data: Uint8Array;
}

// ---------- CRC32(表驱动,兼容标准 zip) ----------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** 计算一段字节的 CRC32(与 zip 标准一致的校验值) */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 把 JS 字符串编码为 UTF-8 字节(浏览器原生,无需库) */
function toUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** DOS 时间格式 (0xFFFF 表示当前时间,zip 规范要求给出) */
function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

/**
 * 把若干条目打包成一个**真实的 STORE 方式 .zip**(零压缩)。
 * 产出物是标准 zip:文件头 + 数据区 + 中央目录 + 结束标记。
 * @returns zip 文件字节(可由 Blob 下载/保存)
 */
export function createStoreZip(entries: ZipEntry[]): Uint8Array {
  const now = Date.now();
  const { time: modTime, date: modDate } = dosDateTime(now);

  const bytes: number[] = [];
  const localOffsets: number[] = []; // 每个条目的本地头偏移

  for (const entry of entries) {
    const nameBytes = toUtf8(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    localOffsets.push(bytes.length);

    // --- 本地文件头(Local File Header) ---
    bytes.push(0x50, 0x4b, 0x03, 0x04);            // 签名 PK\x03\x04
    bytes.push(20, 0);                             // 解压所需版本
    bytes.push(0x08, 0x00);                        // 通用标志(UTF-8 文件名)
    bytes.push(0x00, 0x00);                        // 压缩方式 0 = STORE
    bytes.push(modTime & 0xff, modTime >> 8);      // 修改时间
    bytes.push(modDate & 0xff, modDate >> 8);      // 修改日期
    bytes.push(crc & 0xff, (crc >> 8) & 0xff, (crc >> 16) & 0xff, (crc >> 24) & 0xff); // CRC32
    bytes.push(data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, (data.length >> 24) & 0xff); // 压缩大小
    bytes.push(data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, (data.length >> 24) & 0xff); // 未压缩大小
    bytes.push(nameBytes.length & 0xff, nameBytes.length >> 8); // 文件名字节长
    bytes.push(0x00, 0x00);                        // 扩展字段长
    nameBytes.forEach(b => bytes.push(b));         // 文件名
    data.forEach(b => bytes.push(b));              // 文件内容
  }

  const centralDirStart = bytes.length;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nameBytes = toUtf8(entry.name);
    const crc = crc32(entry.data);

    // --- 中央目录头(Central Directory Header) ---
    bytes.push(0x50, 0x4b, 0x01, 0x02);            // 签名 PK\x01\x02
    bytes.push(20, 0, 20, 0);                      // 生成版本 / 解压所需版本
    bytes.push(0x08, 0x00);                        // 标志(UTF-8)
    bytes.push(0x00, 0x00);                        // 压缩方式 STORE
    bytes.push(modTime & 0xff, modTime >> 8);      // 时间
    bytes.push(modDate & 0xff, modDate >> 8);      // 日期
    bytes.push(crc & 0xff, (crc >> 8) & 0xff, (crc >> 16) & 0xff, (crc >> 24) & 0xff);
    bytes.push(entry.data.length & 0xff, (entry.data.length >> 8) & 0xff, (entry.data.length >> 16) & 0xff, (entry.data.length >> 24) & 0xff);
    bytes.push(entry.data.length & 0xff, (entry.data.length >> 8) & 0xff, (entry.data.length >> 16) & 0xff, (entry.data.length >> 24) & 0xff);
    bytes.push(nameBytes.length & 0xff, nameBytes.length >> 8); // 文件名字节长
    bytes.push(0x00, 0x00);                        // 扩展长
    bytes.push(0x00, 0x00);                        // 注释长
    bytes.push(0x00, 0x00);                        // 磁盘号
    bytes.push(0x00, 0x00);                        // 内部属性
    bytes.push(0x00, 0x00, 0x00, 0x00);            // 外部属性(普通文件)
    const off = localOffsets[i];
    bytes.push(off & 0xff, (off >> 8) & 0xff, (off >> 16) & 0xff, (off >> 24) & 0xff); // 本地头偏移
    nameBytes.forEach(b => bytes.push(b));         // 文件名
  }
  const centralDirSize = bytes.length - centralDirStart;

  // --- 结束标记(EOCD) ---
  bytes.push(0x50, 0x4b, 0x05, 0x06);              // 签名 PK\x05\x06
  bytes.push(0x00, 0x00, 0x00, 0x00);              // 磁盘号 / 中央目录起始磁盘
  const n = entries.length;
  bytes.push(n & 0xff, (n >> 8) & 0xff);           // 本盘条目数
  bytes.push(n & 0xff, (n >> 8) & 0xff);           // 总条目数
  bytes.push(centralDirSize & 0xff, (centralDirSize >> 8) & 0xff, (centralDirSize >> 16) & 0xff, (centralDirSize >> 24) & 0xff);
  bytes.push(centralDirStart & 0xff, (centralDirStart >> 8) & 0xff, (centralDirStart >> 16) & 0xff, (centralDirStart >> 24) & 0xff);
  bytes.push(0x00, 0x00);                          // 注释长

  // 转 Uint8Array(体积不大,一次到位即可)
  return new Uint8Array(bytes);
}

/**
 * 解析一个 STORE 方式的 zip,返回全部条目。
 * 只支持本模块产出(STORE 零压缩);遇到 DEFLATE 压缩条目会抛错,
 * 提示真实 zip 解析在 Tauri 壳(M6)由后端完成。
 */
export function readStoreZip(bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  // 逐条扫描文件头
  while (offset + 30 <= bytes.length) {
    // 读到中央目录(0x02014b50)或结束标记(0x06054b50)即停止 —— 文件头区已结束
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b) {
      const sig = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (sig === 0x0201 || sig === 0x0605) break;
    }
    // 本地文件头签名 PK\x03\x04
    if (!(bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04)) break;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    const method = view.getUint16(8, true);           // 压缩方式(偏移 8)
    const compSize = view.getUint32(18, true);        // 压缩大小(偏移 18)
    const nameLen = view.getUint16(26, true);         // 文件名字节长(偏移 26)
    const extraLen = view.getUint16(28, true);        // 扩展字段长(偏移 28)
    if (method !== 0) {
      throw new Error('该 zip 含压缩(DEFLATE/其它)条目,web 预览无法解压。真实 zip 解析在 Tauri 壳,请改用桌面版导入。');
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart + compSize > bytes.length) break;   // 数据越界:视为非本模块 zip,停止
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLen);
    entries.push({
      name: new TextDecoder().decode(nameBytes),
      data: bytes.subarray(dataStart, dataStart + compSize),
    });
    offset = dataStart + compSize;
  }
  return entries;
}

/** 把存储的字节按 UTF-8 解码为字符串(文本条目读取用) */
export function decodeText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}