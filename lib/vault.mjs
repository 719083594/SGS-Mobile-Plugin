import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const AAD = Buffer.from('SanguoshaMobile-Plugin/v1');
const MAX_PLAINTEXT = 5 * 1024 * 1024, MAX_FILE = 8 * 1024 * 1024;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class VaultError extends Error {
  constructor(code, message) { super(message); this.name = 'VaultError'; this.code = code; }
}
function statOrNull(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function ordinary(file, directory = false) {
  const stat = statOrNull(file);
  if (stat && (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())))
    throw new VaultError('UNSAFE_PATH', '加密存储路径必须为普通目录/文件，不接受符号链接。');
  return stat;
}
function directoryTree(directory) {
  const absolute = path.resolve(directory), anchor = path.parse(absolute).root;
  let current = anchor;
  ordinary(current, true);
  for (const part of absolute.slice(anchor.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); ordinary(current, true);
  }
}
function base64(value, size, maxBytes) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(maxBytes / 3) * 4 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid encrypted envelope');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > maxBytes || (size && bytes.length !== size)) throw new Error('Invalid encrypted envelope');
  return bytes;
}
function boundedRead(file, maxBytes) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new VaultError('UNSAFE_PATH', '加密存储只能读取普通文件。');
    if (stat.size > maxBytes) throw new VaultError('SIZE_LIMIT', '加密会话文件超过大小上限，请保留原文件。');
    const chunks = []; let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65536, maxBytes - size + 1));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      size += count;
      if (size > maxBytes) throw new VaultError('SIZE_LIMIT', '加密会话文件超过大小上限，请保留原文件。');
      chunks.push(chunk.subarray(0, count));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { fs.closeSync(fd); }
}

/** Entire owner map (identities, challenges, sessions) is encrypted.
 * update() performs a synchronous read/modify/write under one cross-process lock.
 * A stale lock is never stolen; a wrong key/corrupt file is never overwritten.
 */
export class SessionVault {
  #key; #maxPlaintext; #maxFile;
  constructor(root, key, { maxPlaintextBytes = MAX_PLAINTEXT, maxFileBytes = MAX_FILE } = {}) {
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/i.test(key)) throw new VaultError('INVALID_KEY', '会话加密密钥不可用。');
    if (!Number.isInteger(maxPlaintextBytes) || maxPlaintextBytes < 1 || maxPlaintextBytes > MAX_PLAINTEXT ||
      !Number.isInteger(maxFileBytes) || maxFileBytes < 128 || maxFileBytes > MAX_FILE)
      throw new VaultError('INVALID_CONFIGURATION', '加密存储大小上限不合法。');
    this.#key = Buffer.from(key, 'hex'); this.#maxPlaintext = maxPlaintextBytes; this.#maxFile = maxFileBytes;
    this.root = path.resolve(root); this.directory = path.join(this.root, 'data');
    this.file = path.join(this.directory, 'sessions.enc.json'); this.lockFile = path.join(this.directory, '.sessions.lock');
  }
  owner(owner) {
    const value = String(owner);
    if (!/^[1-9]\d{4,14}$/.test(value)) throw new VaultError('INVALID_OWNER', '有效QQ身份必需。');
    return value;
  }
  #prepare() {
    directoryTree(this.directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    directoryTree(this.directory); ordinary(this.file); ordinary(this.lockFile);
  }
  #schema(state) {
    if (!isObject(state)) throw new VaultError('INVALID_DATA', '加密会话数据必须为按QQ隔离的对象。');
    for (const [owner, value] of Object.entries(state)) {
      this.owner(owner);
      if (!isObject(value)) throw new VaultError('INVALID_DATA', '本人加密数据必须为对象。');
    }
  }
  read() {
    this.#prepare();
    if (!ordinary(this.file)) return {};
    let plaintext, first;
    try {
      const envelope = JSON.parse(boundedRead(this.file, this.#maxFile));
      if (!isObject(envelope) || envelope.version !== 1 || (envelope.algorithm !== undefined && envelope.algorithm !== 'aes-256-gcm')) throw new Error();
      const iv = base64(envelope.iv, 12, 12), tag = base64(envelope.tag, 16, 16), data = base64(envelope.data, undefined, this.#maxPlaintext);
      const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
      decipher.setAAD(AAD); decipher.setAuthTag(tag);
      first = decipher.update(data); plaintext = Buffer.concat([first, decipher.final()]);
      const value = JSON.parse(plaintext.toString('utf8')); this.#schema(value);
      return value;
    } catch (error) {
      if (error instanceof VaultError && ['SIZE_LIMIT', 'UNSAFE_PATH'].includes(error.code)) throw error;
      throw new VaultError('DECRYPT_FAILED', '社区会话解密失败或完整性校验失败，请保留原密钥和文件。');
    } finally { first?.fill(0); plaintext?.fill(0); }
  }
  #writeLocked(value) {
    this.#schema(value); let plaintext, fd;
    const temporary = path.join(this.directory, `.sessions-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
    try {
      let serialized;
      try { serialized = JSON.stringify(value); } catch { throw new VaultError('INVALID_DATA', '会话数据无法序列化。'); }
      plaintext = Buffer.from(serialized);
      if (plaintext.length > this.#maxPlaintext) throw new VaultError('SIZE_LIMIT', '本人加密数据超过大小上限，原文件未更改。');
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv); cipher.setAAD(AAD);
      const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const output = JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }) + '\n';
      if (Buffer.byteLength(output) > this.#maxFile) throw new VaultError('SIZE_LIMIT', '加密会话文件超过大小上限，原文件未更改。');
      this.#prepare();
      fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o600);
      fs.writeFileSync(fd, output); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      this.#prepare(); fs.renameSync(temporary, this.file); fs.chmodSync(this.file, 0o600);
    } finally {
      plaintext?.fill(0);
      if (fd !== undefined) fs.closeSync(fd);
      directoryTree(this.directory);
      const stat = statOrNull(temporary);
      if (stat?.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(temporary);
    }
  }
  #mutate(operation) {
    this.#prepare(); let lock, held;
    try { lock = fs.openSync(this.lockFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o600); held = fs.fstatSync(lock); }
    catch (error) {
      if (error.code === 'EEXIST') throw new VaultError('STORAGE_BUSY', '存储正在更新或存在遗留锁，请稍后重试；不要覆盖原会话文件。');
      throw new VaultError('STORAGE_FAILED', '无法建立加密存储写锁，请检查目录权限。');
    }
    try {
      fs.writeFileSync(lock, String(process.pid) + '\n');
      const state = this.read(), result = operation(state);
      if (result && typeof result.then === 'function') throw new VaultError('INVALID_DATA', '加密存储更新必须同步完成。');
      this.#writeLocked(state); return result;
    } finally {
      fs.closeSync(lock); directoryTree(this.directory);
      const current = statOrNull(this.lockFile);
      if (current?.isFile() && !current.isSymbolicLink() && current.ino === held.ino && current.dev === held.dev) fs.unlinkSync(this.lockFile);
    }
  }
  // Full-map replacement is kept for compatibility, still verifies the old file first.
  write(value) { this.#schema(value); return this.#mutate(state => { for (const owner of Object.keys(state)) delete state[owner]; Object.assign(state, value); }); }
  get(owner) { const id = this.owner(owner); return this.read()[id] ?? null; }
  update(owner, updater) {
    const id = this.owner(owner);
    if (typeof updater !== 'function') throw new VaultError('INVALID_DATA', '加密存储更新需要同步函数。');
    return this.#mutate(state => {
      const value = updater(state[id] ?? null);
      if (value && typeof value.then === 'function') throw new VaultError('INVALID_DATA', '加密存储更新必须同步完成。');
      if (value === null) delete state[id];
      else if (isObject(value)) state[id] = value;
      else throw new VaultError('INVALID_DATA', '本人加密数据必须为对象或删除标记。');
      return value;
    });
  }
  set(owner, value) { return this.update(owner, () => value); }
}
