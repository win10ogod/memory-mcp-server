/**
 * 結構化日誌系統
 * 提供統一的日誌記錄接口
 */

/**
 * 日誌級別
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL'
};

/**
 * 日誌級別優先級
 */
const LOG_LEVEL_PRIORITY = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * 結構化日誌記錄器
 */
export class Logger {
  /**
   * @param {string} context - 日誌上下文（如模塊名）
   * @param {string} minLevel - 最低日誌級別
   */
  constructor(context, minLevel = 'INFO') {
    this.context = context;
    this.minLevel = minLevel;
    this.metadata = {};
  }

  /**
   * 設置全局元數據
   * @param {Object} metadata - 元數據對象
   */
  setMetadata(metadata) {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * 檢查是否應該記錄該級別的日誌
   * @param {string} level - 日誌級別
   * @returns {boolean}
   */
  shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * 記錄日誌
   * @param {string} level - 日誌級別
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...this.metadata,
      ...meta
    };

    // 錯誤對象特殊處理
    if (meta.error instanceof Error) {
      entry.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack
      };
      delete entry.error; // 避免重複
    }

    // 輸出到 stderr（MCP 服務器的標準做法）
    console.error(JSON.stringify(entry));
  }

  /**
   * DEBUG 級別日誌
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  debug(message, meta = {}) {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * INFO 級別日誌
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  info(message, meta = {}) {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * WARN 級別日誌
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  warn(message, meta = {}) {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * ERROR 級別日誌
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  error(message, meta = {}) {
    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * FATAL 級別日誌
   * @param {string} message - 日誌消息
   * @param {Object} meta - 附加元數據
   */
  fatal(message, meta = {}) {
    this.log(LogLevel.FATAL, message, meta);
  }

  /**
   * 創建子日誌記錄器
   * @param {string} subContext - 子上下文
   * @returns {Logger}
   */
  child(subContext) {
    const childLogger = new Logger(`${this.context}.${subContext}`, this.minLevel);
    childLogger.setMetadata(this.metadata);
    return childLogger;
  }
}

/**
 * 創建日誌記錄器
 * @param {string} context - 上下文
 * @param {string} minLevel - 最低日誌級別
 * @returns {Logger}
 */
export function createLogger(context, minLevel = process.env.LOG_LEVEL || 'INFO') {
  return new Logger(context, minLevel);
}

// 導出默認日誌記錄器
export const defaultLogger = createLogger('memory-mcp-server');

export default { Logger, createLogger, defaultLogger, LogLevel };
