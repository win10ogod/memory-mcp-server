/**
 * 查詢結果緩存
 * 減少重複查詢的計算開銷
 */

import { LRUCache } from './lru-cache.js';
import crypto from 'crypto';

/**
 * 生成查詢緩存鍵
 * @param {Array} keywords - 關鍵詞數組
 * @param {string} conversationId - 對話 ID
 * @param {Object} options - 查詢選項
 * @returns {string} 緩存鍵
 */
function generateCacheKey(keywords, conversationId, options = {}) {
  const keyData = {
    keywords: keywords.map(kw => ({ word: kw.word, weight: kw.weight })).sort((a, b) => a.word.localeCompare(b.word)),
    conversationId,
    options: {
      modalityVectorWeight: options.modalityVectorWeight,
      hasModalities: Array.isArray(options.queryModalities) && options.queryModalities.length > 0
    }
  };

  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(keyData))
    .digest('hex')
    .substring(0, 16);

  return `${conversationId}:${hash}`;
}

/**
 * 查詢緩存管理器
 */
export class QueryCache extends LRUCache {
  constructor(maxSize = 50, maxAge = 5 * 60 * 1000) {
    super(maxSize, maxAge); // 緩存 50 個查詢結果，5 分鐘過期
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 獲取查詢結果
   * @param {Array} keywords - 關鍵詞
   * @param {string} conversationId - 對話 ID
   * @param {Object} options - 查詢選項
   * @returns {Object|null} 緩存的查詢結果
   */
  getQuery(keywords, conversationId, options = {}) {
    const key = generateCacheKey(keywords, conversationId, options);
    const result = this.get(key);

    if (result) {
      this.hits++;
      return result;
    } else {
      this.misses++;
      return null;
    }
  }

  /**
   * 緩存查詢結果
   * @param {Array} keywords - 關鍵詞
   * @param {string} conversationId - 對話 ID
   * @param {Object} options - 查詢選項
   * @param {Object} result - 查詢結果
   */
  setQuery(keywords, conversationId, options = {}, result) {
    const key = generateCacheKey(keywords, conversationId, options);
    this.set(key, result);
  }

  /**
   * 使查詢緩存失效（當記憶發生變化時）
   * @param {string} conversationId - 對話 ID
   */
  invalidateConversation(conversationId) {
    let invalidated = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${conversationId}:`)) {
        this.delete(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * 獲取緩存統計
   * @returns {Object}
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      total,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * 重置統計數據
   */
  resetStats() {
    this.hits = 0;
    this.misses = 0;
  }
}

export default QueryCache;
