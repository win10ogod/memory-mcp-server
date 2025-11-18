/**
 * 速率限制器
 * 防止 API 濫用和過載
 */

/**
 * 速率限制器類
 */
export class RateLimiter {
  /**
   * @param {number} maxRequests - 時間窗口內最大請求數
   * @param {number} windowMs - 時間窗口（毫秒）
   */
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // conversationId -> [timestamps]
    this.blocked = new Set(); // 被阻止的 conversationId
    this.violations = new Map(); // conversationId -> 違規次數

    // 定期清理過期數據
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs);
  }

  /**
   * 檢查是否超過速率限制
   * @param {string} conversationId - 對話 ID
   * @param {string} toolName - 工具名稱（用於記錄）
   * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
   */
  checkLimit(conversationId, toolName = 'unknown') {
    // 檢查是否被永久阻止
    if (this.blocked.has(conversationId)) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Infinity,
        reason: 'Blocked due to repeated violations'
      };
    }

    const now = Date.now();
    const requests = this.requests.get(conversationId) || [];

    // 清理過期請求
    const validRequests = requests.filter(ts => now - ts < this.windowMs);

    // 檢查是否超過限制
    if (validRequests.length >= this.maxRequests) {
      this.recordViolation(conversationId);

      const oldestRequest = Math.min(...validRequests);
      const resetTime = oldestRequest + this.windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        reason: `Rate limit exceeded: ${validRequests.length}/${this.maxRequests} requests in ${this.windowMs}ms`
      };
    }

    // 記錄新請求
    validRequests.push(now);
    this.requests.set(conversationId, validRequests);

    return {
      allowed: true,
      remaining: this.maxRequests - validRequests.length,
      resetTime: now + this.windowMs,
      reason: null
    };
  }

  /**
   * 記錄違規
   * @param {string} conversationId - 對話 ID
   */
  recordViolation(conversationId) {
    const violations = (this.violations.get(conversationId) || 0) + 1;
    this.violations.set(conversationId, violations);

    // 超過 5 次違規則永久阻止
    if (violations >= 5) {
      this.blocked.add(conversationId);
      console.error(`[RateLimiter] Blocked ${conversationId} after ${violations} violations`);
    }
  }

  /**
   * 清理過期數據
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // 清理過期請求記錄
    for (const [conversationId, requests] of this.requests.entries()) {
      const validRequests = requests.filter(ts => now - ts < this.windowMs);

      if (validRequests.length === 0) {
        this.requests.delete(conversationId);
        cleaned++;
      } else {
        this.requests.set(conversationId, validRequests);
      }
    }

    if (cleaned > 0) {
      console.error(`[RateLimiter] Cleaned ${cleaned} expired conversation records`);
    }
  }

  /**
   * 解除對話阻止
   * @param {string} conversationId - 對話 ID
   */
  unblock(conversationId) {
    this.blocked.delete(conversationId);
    this.violations.delete(conversationId);
    this.requests.delete(conversationId);
  }

  /**
   * 獲取統計信息
   * @returns {Object}
   */
  getStats() {
    return {
      activeConversations: this.requests.size,
      blockedConversations: this.blocked.size,
      totalViolations: Array.from(this.violations.values()).reduce((sum, v) => sum + v, 0),
      config: {
        maxRequests: this.maxRequests,
        windowMs: this.windowMs
      }
    };
  }

  /**
   * 停止清理定時器
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * 全局速率限制器實例
 */
export const globalRateLimiter = new RateLimiter(100, 60000); // 每分鐘最多 100 個請求

export default RateLimiter;
