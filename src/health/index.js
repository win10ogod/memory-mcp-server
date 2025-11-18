/**
 * 健康檢查系統
 * 提供服務器健康狀態監控
 */

/**
 * 健康狀態
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

/**
 * 健康檢查器
 */
export class HealthChecker {
  constructor(managers, metrics) {
    this.managers = managers;
    this.metrics = metrics;
    this.checks = new Map();
    this.lastCheckTime = null;
    this.lastStatus = HealthStatus.HEALTHY;

    // 註冊默認檢查
    this.registerDefaultChecks();
  }

  /**
   * 註冊默認健康檢查
   */
  registerDefaultChecks() {
    // 內存檢查
    this.registerCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      if (heapUsedPercent > 90) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Heap usage critical: ${heapUsedPercent.toFixed(2)}%`
        };
      } else if (heapUsedPercent > 75) {
        return {
          status: HealthStatus.DEGRADED,
          message: `Heap usage high: ${heapUsedPercent.toFixed(2)}%`
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: `Heap usage normal: ${heapUsedPercent.toFixed(2)}%`
      };
    });

    // 錯誤率檢查
    this.registerCheck('error_rate', async () => {
      const metrics = this.metrics.getMetrics();
      const errorRate = parseFloat(metrics.requests.errorRate);

      if (errorRate > 50) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Error rate critical: ${errorRate}%`
        };
      } else if (errorRate > 20) {
        return {
          status: HealthStatus.DEGRADED,
          message: `Error rate elevated: ${errorRate}%`
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: `Error rate normal: ${errorRate}%`
      };
    });

    // 緩存檢查
    this.registerCheck('cache', async () => {
      if (!this.managers.shortTerm || !this.managers.longTerm) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'Cache managers initialized'
        };
      }

      const stSize = this.managers.shortTerm.size;
      const ltSize = this.managers.longTerm.size;

      if (stSize > 500 || ltSize > 500) {
        return {
          status: HealthStatus.DEGRADED,
          message: `Cache size high: ST=${stSize}, LT=${ltSize}`
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: `Cache size normal: ST=${stSize}, LT=${ltSize}`
      };
    });
  }

  /**
   * 註冊健康檢查
   * @param {string} name - 檢查名稱
   * @param {Function} checkFn - 檢查函數
   */
  registerCheck(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * 執行所有健康檢查
   * @returns {Promise<Object>}
   */
  async checkHealth() {
    const results = {};
    let overallStatus = HealthStatus.HEALTHY;

    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const result = await checkFn();
        results[name] = result;

        // 更新整體狀態
        if (result.status === HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (result.status === HealthStatus.DEGRADED && overallStatus !== HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } catch (error) {
        results[name] = {
          status: HealthStatus.UNHEALTHY,
          message: `Check failed: ${error.message}`,
          error: error.message
        };
        overallStatus = HealthStatus.UNHEALTHY;
      }
    }

    this.lastCheckTime = new Date().toISOString();
    this.lastStatus = overallStatus;

    return {
      status: overallStatus,
      timestamp: this.lastCheckTime,
      checks: results
    };
  }

  /**
   * 獲取完整的健康報告
   * @returns {Promise<Object>}
   */
  async getHealthReport() {
    const healthCheck = await this.checkHealth();
    const metrics = this.metrics.getMetrics();
    const memUsage = process.memoryUsage();

    return {
      status: healthCheck.status,
      timestamp: healthCheck.timestamp,
      uptime: metrics.uptime,
      version: process.env.npm_package_version || '0.1.0',
      node_version: process.version,
      pid: process.pid,
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        heapUsedPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2)
      },
      metrics: {
        requests: metrics.requests,
        latency: metrics.latency,
        cache: metrics.cache
      },
      checks: healthCheck.checks,
      managers: {
        shortTerm: this.managers.shortTerm?.size || 0,
        longTerm: this.managers.longTerm?.size || 0,
        storage: this.managers.storage?.size || 0
      }
    };
  }

  /**
   * 獲取簡單的健康狀態
   * @returns {Promise<Object>}
   */
  async getSimpleHealth() {
    const healthCheck = await this.checkHealth();
    return {
      status: healthCheck.status,
      timestamp: healthCheck.timestamp,
      uptime: process.uptime()
    };
  }
}

/**
 * 創建健康檢查器
 * @param {Object} managers - 管理器對象
 * @param {Object} metrics - 指標收集器
 * @returns {HealthChecker}
 */
export function createHealthChecker(managers, metrics) {
  return new HealthChecker(managers, metrics);
}

export default { HealthChecker, createHealthChecker, HealthStatus };
