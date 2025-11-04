/**
 * JSON 文件存储层
 * 提供内存数据的持久化存储功能
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 默认存储目录（项目根目录下的 data 文件夹）
const DEFAULT_DATA_DIR = path.join(__dirname, '../../data');

/**
 * 确保数据目录存在
 * @param {string} dirPath - 目录路径
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
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

/**
 * 保存数据到 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {*} data - 要保存的数据
 */
export async function saveJsonFile(filePath, data) {
  try {
    // 确保目录存在
    await ensureDir(path.dirname(filePath));
    
    // 序列化并保存
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Error saving JSON file ${filePath}:`, error);
    throw error;
  }
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
    await saveJsonFile(this.getShortTermPath(), memories);
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
    await saveJsonFile(this.getLongTermPath(), memories);
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

