/**
 * JSON 文件存储层
 * 提供内存数据的持久化存储功能
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prepareModalitiesForStorage } from './modalities.js';
import { optimizeMemory } from '../utils/data-optimizer.js';
import { deduplicateImageModalities } from '../utils/image-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 默认存储目录（项目根目录下的 data 文件夹）
const DEFAULT_DATA_DIR = path.join(__dirname, '../../data');

// 目录存在性缓存，避免重复检查
const dirExistsCache = new Set();

/**
 * 确保数据目录存在（带缓存优化）
 * @param {string} dirPath - 目录路径
 */
async function ensureDir(dirPath) {
  // 检查缓存
  if (dirExistsCache.has(dirPath)) {
    return;
  }

  try {
    await fs.access(dirPath);
    // 目录存在，加入缓存
    dirExistsCache.add(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 目录不存在，创建它
      try {
        await fs.mkdir(dirPath, { recursive: true });
        dirExistsCache.add(dirPath);
      } catch (mkdirError) {
        // 处理并发创建的竞态条件
        if (mkdirError.code === 'EEXIST') {
          dirExistsCache.add(dirPath);
        } else {
          // 其他错误则抛出
          throw mkdirError;
        }
      }
    } else {
      // 其他访问错误（权限等）
      throw error;
    }
  }
}

/**
 * 加载 JSON 文件，如果文件不存在则返回默认值
 * @param {string} filePath - 文件路径
 * @param {*} defaultValue - 默认值
 * @returns {Promise<*>} 加载的数据或默认值
 */
export async function loadJsonFileIfExists(filePath, defaultValue = null) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回默认值
      return defaultValue;
    }
    // 其他错误（如 JSON 解析错误）抛出
    console.error(`Error loading JSON file ${filePath}:`, error);
    throw error;
  }
}

// 写入缓存和批次处理
const writeCache = new Map(); // filePath -> { data, timer, dirty }
const WRITE_DELAY_MS = 1000; // 延迟写入时间（1秒）
const MAX_RETRIES = 3; // 最大重试次数

/**
 * 保存数据到 JSON 文件（带重试机制）
 * @param {string} filePath - 文件路径
 * @param {*} data - 要保存的数据
 * @param {number} retryCount - 当前重试次数
 */
async function saveJsonFileWithRetry(filePath, data, retryCount = 0) {
  try {
    // 确保目录存在
    await ensureDir(path.dirname(filePath));

    // 序列化并保存
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    if (retryCount < MAX_RETRIES && (error.code === 'EBUSY' || error.code === 'EAGAIN')) {
      // 文件正在被使用，延迟后重试
      const delay = Math.pow(2, retryCount) * 100; // 指数退避
      await new Promise(resolve => setTimeout(resolve, delay));
      return saveJsonFileWithRetry(filePath, data, retryCount + 1);
    }
    console.error(`Error saving JSON file ${filePath}:`, error);
    throw error;
  }
}

/**
 * 保存数据到 JSON 文件（带缓存和批次处理）
 * @param {string} filePath - 文件路径
 * @param {*} data - 要保存的数据
 * @param {boolean} immediate - 是否立即写入
 */
export async function saveJsonFile(filePath, data, immediate = false) {
  if (immediate) {
    // 立即写入模式
    if (writeCache.has(filePath)) {
      const cached = writeCache.get(filePath);
      clearTimeout(cached.timer);
      writeCache.delete(filePath);
    }
    return saveJsonFileWithRetry(filePath, data);
  }

  // 延迟写入模式
  const cached = writeCache.get(filePath);

  if (cached) {
    // 更新缓存数据并重置定时器
    clearTimeout(cached.timer);
    cached.data = data;
    cached.dirty = true;
  } else {
    // 创建新缓存项
    writeCache.set(filePath, {
      data,
      dirty: true,
      timer: null
    });
  }

  // 设置延迟写入定时器
  const cacheEntry = writeCache.get(filePath);
  cacheEntry.timer = setTimeout(async () => {
    if (cacheEntry.dirty) {
      try {
        await saveJsonFileWithRetry(filePath, cacheEntry.data);
        cacheEntry.dirty = false;
      } catch (error) {
        console.error(`Failed to flush write cache for ${filePath}:`, error);
      }
    }
    writeCache.delete(filePath);
  }, WRITE_DELAY_MS);
}

/**
 * 刷新所有待写入的缓存（用于优雅关机）
 */
export async function flushAllWrites() {
  const flushPromises = [];

  for (const [filePath, cached] of writeCache.entries()) {
    if (cached.dirty) {
      clearTimeout(cached.timer);
      flushPromises.push(
        saveJsonFileWithRetry(filePath, cached.data)
          .catch(error => {
            console.error(`Error flushing ${filePath}:`, error);
          })
      );
    } else {
      clearTimeout(cached.timer);
    }
  }

  await Promise.all(flushPromises);
  writeCache.clear();
}

function stripEphemeralFields(object) {
  if (!object || typeof object !== 'object') {
    return;
  }

  for (const key of Object.keys(object)) {
    if (key.startsWith('_')) {
      delete object[key];
    }
  }
}

function normalizeDateLike(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function prepareShortTermMemoryForStorage(memory) {
  const sanitized = { ...memory };

  stripEphemeralFields(sanitized);

  // 統一時間戳為 timestamp 字段（ISO 字符串）
  const timeSource = sanitized.time_stamp ?? sanitized.timestamp ?? sanitized.timeStamp;
  if (timeSource) {
    sanitized.timestamp = normalizeDateLike(timeSource);
  }
  delete sanitized.time_stamp;
  delete sanitized.timeStamp;

  if (Array.isArray(memory.keywords)) {
    sanitized.keywords = memory.keywords
      .filter(kw => kw && typeof kw.word === 'string')
      .map(kw => ({
        word: kw.word,
        weight: Number.isFinite(kw.weight) ? kw.weight : 1
      }));
  }

  // 準備 modalities，優先使用 modalities 字段
  let modalities = prepareModalitiesForStorage(memory.modalities ?? memory.attachments ?? []);

  // 去除重複的圖像
  modalities = deduplicateImageModalities(modalities);

  // 只保存 modalities，不保存冗餘的 attachments
  sanitized.modalities = modalities;
  delete sanitized.attachments;

  // 應用數據優化（去重關鍵詞等）
  return optimizeMemory(sanitized, {
    normalizeTimestamps: false, // 已經處理過了
    removeAttachmentsRedundancy: false, // 已經處理過了
    deduplicateKeywords: true
  });
}

function prepareLongTermMemoryForStorage(memory) {
  const sanitized = { ...memory };

  stripEphemeralFields(sanitized);

  // 標準化時間戳
  if (sanitized.createdAt) {
    sanitized.createdAt = normalizeDateLike(sanitized.createdAt);
  }
  if (sanitized.updatedAt) {
    sanitized.updatedAt = normalizeDateLike(sanitized.updatedAt);
  }

  // 準備 modalities，優先使用 modalities 字段
  let modalities = prepareModalitiesForStorage(memory.modalities ?? memory.attachments ?? []);

  // 去除重複的圖像
  modalities = deduplicateImageModalities(modalities);

  // 只保存 modalities，不保存冗餘的 attachments
  sanitized.modalities = modalities;
  delete sanitized.attachments;

  return sanitized;
}

/**
 * 存储管理器类
 * 管理特定对话的记忆存储
 */
export class StorageManager {
  /**
   * @param {string} conversationId - 对话 ID
   * @param {string} [dataDir] - 数据目录路径
   */
  constructor(conversationId, dataDir = DEFAULT_DATA_DIR) {
    this.conversationId = conversationId;
    this.dataDir = dataDir;
    this.conversationDir = path.join(dataDir, this.sanitizeId(conversationId));
  }

  /**
   * 清理 ID，使其适合作为文件/目录名
   * @param {string} id - 原始 ID
   * @returns {string} 清理后的 ID
   */
  sanitizeId(id) {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * 获取短期记忆文件路径
   * @returns {string}
   */
  getShortTermPath() {
    return path.join(this.conversationDir, 'short-term-memory.json');
  }

  /**
   * 获取长期记忆文件路径
   * @returns {string}
   */
  getLongTermPath() {
    return path.join(this.conversationDir, 'long-term-memory.json');
  }

  /**
   * 加载短期记忆
   * @returns {Promise<Array>}
   */
  async loadShortTermMemories() {
    return await loadJsonFileIfExists(this.getShortTermPath(), []);
  }

  /**
   * 保存短期记忆
   * @param {Array} memories
   */
  async saveShortTermMemories(memories) {
    const dataToSave = Array.isArray(memories)
      ? memories.map(prepareShortTermMemoryForStorage)
      : [];
    await saveJsonFile(this.getShortTermPath(), dataToSave);
  }

  /**
   * 加载长期记忆
   * @returns {Promise<Array>}
   */
  async loadLongTermMemories() {
    return await loadJsonFileIfExists(this.getLongTermPath(), []);
  }

  /**
   * 保存长期记忆
   * @param {Array} memories
   */
  async saveLongTermMemories(memories) {
    const dataToSave = Array.isArray(memories)
      ? memories.map(prepareLongTermMemoryForStorage)
      : [];
    await saveJsonFile(this.getLongTermPath(), dataToSave);
  }

  /**
   * 检查对话数据是否存在
   * @returns {Promise<boolean>}
   */
  async exists() {
    try {
      await fs.access(this.conversationDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除对话的所有数据
   */
  async deleteAll() {
    try {
      await fs.rm(this.conversationDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Error deleting conversation data:`, error);
      throw error;
    }
  }
}

/**
 * 获取所有已存储的对话 ID 列表
 * @param {string} [dataDir] - 数据目录路径
 * @returns {Promise<string[]>}
 */
export async function listConversations(dataDir = DEFAULT_DATA_DIR) {
  try {
    await ensureDir(dataDir);
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    console.error('Error listing conversations:', error);
    return [];
  }
}

