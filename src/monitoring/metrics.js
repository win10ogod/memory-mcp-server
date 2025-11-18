/**
 * 性能指標收集器
 * 收集和分析服務器性能數據
 */

/**
 * 計算百分位數
 * @param {number[]} arr - 數值數組
 * @param {number} p - 百分位（0-1）
 * @returns {number}
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;

  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 性能指標收集器
 */
export class MetricsCollector {
  constructor() {
    this.startTime = Date.now();

    // 請求統計
    this.requestCount = 0;
    this.successCount = 0;
    this.errorCount = 0;

    // 持續時間統計（保留最近 1000 個）
    this.durations = [];
    this.maxDurations = 1000;

    // 按工具分類的統計
    this.toolMetrics = new Map();

    // 緩存統計
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // 內存統計
    this.memorySnapshots = [];
    this.maxMemorySnapshots = 100;
  }

  /**
   * 記錄請求
   * @param {Object} options - 請求選項
   * @param {number} options.duration - 請求持續時間（毫秒）
   * @param {boolean} options.success - 是否成功
   * @param {string} options.toolName - 工具名稱
   * @param {string} options.conversationId - 對話 ID
   * @param {Error} options.error - 錯誤對象（如果有）
   */
  recordRequest({ duration, success, toolName, conversationId, error }) {
    // 總體統計
    this.requestCount++;
    if (success) {
      this.successCount++;
    } else {
      this.errorCount++;
    }

    // 記錄持續時間
    this.durations.push(duration);
    if (this.durations.length > this.maxDurations) {
      this.durations.shift();
    }

    // 按工具統計
    if (toolName) {
      if (!this.toolMetrics.has(toolName)) {
        this.toolMetrics.set(toolName, {
          count: 0,
          successCount: 0,
          errorCount: 0,
          durations: []
        });
      }

      const toolStats = this.toolMetrics.get(toolName);
      toolStats.count++;
      if (success) {
        toolStats.successCount++;
      } else {
        toolStats.errorCount++;
      }
      toolStats.durations.push(duration);

      // 限制每個工具的持續時間記錄數量
      if (toolStats.durations.length > 100) {
        toolStats.durations.shift();
      }
    }
  }

  /**
   * 記錄緩存命中
   * @param {boolean} hit - 是否命中
   */
  recordCacheAccess(hit) {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * 記錄內存快照
   */
  recordMemorySnapshot() {
    const memUsage = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now(),
      ...memUsage
    });

    if (this.memorySnapshots.length > this.maxMemorySnapshots) {
      this.memorySnapshots.shift();
    }
  }

  /**
   * 獲取整體指標
   * @returns {Object}
   */
  getMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);

    // 計算請求率
    const requestsPerSecond = this.requestCount / (uptimeSeconds || 1);

    // 計算錯誤率
    const errorRate = this.requestCount > 0
      ? (this.errorCount / this.requestCount * 100).toFixed(2)
      : 0;

    // 計算持續時間統計
    const avgDuration = this.durations.length > 0
      ? this.durations.reduce((sum, d) => sum + d, 0) / this.durations.length
      : 0;

    // 計算緩存命中率
    const totalCacheAccess = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheAccess > 0
      ? (this.cacheHits / totalCacheAccess * 100).toFixed(2)
      : 0;

    // 獲取最新內存使用
    const latestMemory = this.memorySnapshots.length > 0
      ? this.memorySnapshots[this.memorySnapshots.length - 1]
      : process.memoryUsage();

    return {
      uptime: {
        ms: uptime,
        seconds: uptimeSeconds,
        human: this.formatUptime(uptimeSeconds)
      },
      requests: {
        total: this.requestCount,
        success: this.successCount,
        error: this.errorCount,
        errorRate: `${errorRate}%`,
        requestsPerSecond: requestsPerSecond.toFixed(2)
      },
      latency: {
        avg: avgDuration.toFixed(2),
        p50: percentile(this.durations, 0.50).toFixed(2),
        p95: percentile(this.durations, 0.95).toFixed(2),
        p99: percentile(this.durations, 0.99).toFixed(2),
        max: this.durations.length > 0 ? Math.max(...this.durations).toFixed(2) : 0,
        unit: 'ms'
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        total: totalCacheAccess,
        hitRate: `${cacheHitRate}%`
      },
      memory: {
        rss: `${(latestMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(latestMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(latestMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(latestMemory.external / 1024 / 1024).toFixed(2)} MB`
      },
      toolStats: this.getToolStats()
    };
  }

  /**
   * 獲取按工具分類的統計
   * @returns {Object}
   */
  getToolStats() {
    const stats = {};

    for (const [toolName, data] of this.toolMetrics.entries()) {
      const errorRate = data.count > 0
        ? (data.errorCount / data.count * 100).toFixed(2)
        : 0;

      const avgDuration = data.durations.length > 0
        ? data.durations.reduce((sum, d) => sum + d, 0) / data.durations.length
        : 0;

      stats[toolName] = {
        count: data.count,
        success: data.successCount,
        error: data.errorCount,
        errorRate: `${errorRate}%`,
        avgDuration: avgDuration.toFixed(2),
        p95Duration: percentile(data.durations, 0.95).toFixed(2)
      };
    }

    return stats;
  }

  /**
   * 格式化運行時間
   * @param {number} seconds - 秒數
   * @returns {string}
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * 重置所有統計數據
   */
  reset() {
    this.requestCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.durations = [];
    this.toolMetrics.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.memorySnapshots = [];
    this.startTime = Date.now();
  }
}

/**
 * 全局指標收集器實例
 */
export const globalMetrics = new MetricsCollector();

// 每分鐘記錄一次內存快照
setInterval(() => {
  globalMetrics.recordMemorySnapshot();
}, 60000);

export default MetricsCollector;
