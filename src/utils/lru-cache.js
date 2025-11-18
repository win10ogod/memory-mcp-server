/**
 * LRU (Least Recently Used) 缓存实现
 * 用于管理 Manager 实例，防止内存泄漏
 */

export class LRUCache {
  /**
   * @param {number} maxSize - 最大缓存数量
   * @param {number} maxAge - 最大存活时间（毫秒）
   */
  constructor(maxSize = 100, maxAge = 30 * 60 * 1000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.cache = new Map();
    this.accessTimes = new Map();
  }

  /**
   * 获取缓存项
   * @param {string} key - 键
   * @returns {*} 值或 undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const accessTime = this.accessTimes.get(key);
    const now = Date.now();

    // 检查是否过期
    if (now - accessTime > this.maxAge) {
      this.delete(key);
      return undefined;
    }

    // 更新访问时间（LRU 策略）
    this.accessTimes.set(key, now);

    return this.cache.get(key);
  }

  /**
   * 设置缓存项
   * @param {string} key - 键
   * @param {*} value - 值
   */
  set(key, value) {
    const now = Date.now();

    // 如果键已存在，更新它
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessTimes.set(key, now);
      return;
    }

    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    // 添加新项
    this.cache.set(key, value);
    this.accessTimes.set(key, now);
  }

  /**
   * 检查键是否存在
   * @param {string} key - 键
   * @returns {boolean}
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const accessTime = this.accessTimes.get(key);
    const now = Date.now();

    // 检查是否过期
    if (now - accessTime > this.maxAge) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   * @param {string} key - 键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    this.accessTimes.delete(key);
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.accessTimes.clear();
  }

  /**
   * 删除最旧的缓存项
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
    }
  }

  /**
   * 清理过期项
   * @returns {number} 清理的项数
   */
  cleanExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, time] of this.accessTimes.entries()) {
      if (now - time > this.maxAge) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    return expiredKeys.length;
  }

  /**
   * 获取缓存大小
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    const ages = [];

    for (const time of this.accessTimes.values()) {
      ages.push(now - time);
    }

    return {
      size: this.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge,
      avgAge: ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
      oldestAge: ages.length > 0 ? Math.max(...ages) : 0
    };
  }
}

export default LRUCache;
