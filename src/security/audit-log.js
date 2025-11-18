/**
 * 審計日誌系統
 * 記錄所有重要操作和安全事件
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 審計事件類型
 */
export const AuditEventType = {
  TOOL_CALL: 'tool_call',
  MEMORY_ADD: 'memory_add',
  MEMORY_DELETE: 'memory_delete',
  MEMORY_UPDATE: 'memory_update',
  MEMORY_SEARCH: 'memory_search',
  BACKUP_CREATE: 'backup_create',
  BACKUP_RESTORE: 'backup_restore',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  VALIDATION_ERROR: 'validation_error',
  AUTH_FAILURE: 'auth_failure',
  SYSTEM_ERROR: 'system_error'
};

/**
 * 審計日誌記錄器
 */
export class AuditLogger {
  /**
   * @param {string} logPath - 日誌文件路徑
   * @param {Object} options - 配置選項
   */
  constructor(logPath = null, options = {}) {
    this.logPath = logPath || path.join(__dirname, '../../data/audit.log');
    this.options = {
      enableFileLogging: options.enableFileLogging !== false,
      enableConsoleLogging: options.enableConsoleLogging !== false,
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10 MB
      rotateOnSize: options.rotateOnSize !== false
    };

    this.buffer = [];
    this.flushInterval = null;
    this.isWriting = false;

    // 每 5 秒刷新一次緩衝區
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * 記錄審計事件
   * @param {Object} event - 事件對象
   * @param {string} event.type - 事件類型
   * @param {string} event.conversationId - 對話 ID
   * @param {string} event.toolName - 工具名稱（可選）
   * @param {boolean} event.success - 是否成功
   * @param {string} event.userId - 用戶 ID（可選）
   * @param {Object} event.metadata - 附加元數據
   * @param {Error} event.error - 錯誤對象（可選）
   */
  async log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: event.type,
      conversationId: event.conversationId || 'unknown',
      toolName: event.toolName || null,
      success: event.success !== false,
      userId: event.userId || null,
      metadata: event.metadata || {},
      error: event.error ? {
        name: event.error.name,
        message: event.error.message,
        code: event.error.code
      } : null
    };

    // 添加到緩衝區
    this.buffer.push(entry);

    // 控制台輸出（如果啟用）
    if (this.options.enableConsoleLogging) {
      console.error(`[AUDIT] ${entry.type} - ${entry.conversationId} - ${entry.success ? 'SUCCESS' : 'FAILURE'}`);
    }

    // 如果緩衝區太大，立即刷新
    if (this.buffer.length >= 100) {
      await this.flush();
    }
  }

  /**
   * 刷新緩衝區到文件
   */
  async flush() {
    if (this.buffer.length === 0 || this.isWriting || !this.options.enableFileLogging) {
      return;
    }

    this.isWriting = true;
    const entries = this.buffer.splice(0);

    try {
      // 確保目錄存在
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });

      // 檢查文件大小並輪轉
      if (this.options.rotateOnSize) {
        await this.rotateIfNeeded();
      }

      // 寫入日誌
      const lines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(this.logPath, lines, 'utf-8');
    } catch (error) {
      console.error('[AuditLogger] Failed to flush logs:', error);
      // 如果寫入失敗，將條目放回緩衝區
      this.buffer.unshift(...entries);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * 如果需要則輪轉日誌文件
   */
  async rotateIfNeeded() {
    try {
      const stats = await fs.stat(this.logPath);

      if (stats.size >= this.options.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${this.logPath}.${timestamp}`;
        await fs.rename(this.logPath, rotatedPath);
        console.error(`[AuditLogger] Rotated log file to ${rotatedPath}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[AuditLogger] Error checking log file size:', error);
      }
    }
  }

  /**
   * 記錄工具調用
   * @param {Object} params - 參數
   */
  async logToolCall({ conversationId, toolName, success, args, result, error, duration }) {
    await this.log({
      type: AuditEventType.TOOL_CALL,
      conversationId,
      toolName,
      success,
      metadata: {
        args,
        result: success ? result : null,
        duration
      },
      error
    });
  }

  /**
   * 記錄記憶操作
   * @param {Object} params - 參數
   */
  async logMemoryOperation({ conversationId, operation, success, memoryId, error }) {
    await this.log({
      type: operation,
      conversationId,
      success,
      metadata: { memoryId },
      error
    });
  }

  /**
   * 記錄速率限制超限
   * @param {Object} params - 參數
   */
  async logRateLimitExceeded({ conversationId, toolName, limit, current }) {
    await this.log({
      type: AuditEventType.RATE_LIMIT_EXCEEDED,
      conversationId,
      toolName,
      success: false,
      metadata: { limit, current }
    });
  }

  /**
   * 記錄驗證錯誤
   * @param {Object} params - 參數
   */
  async logValidationError({ conversationId, toolName, field, error }) {
    await this.log({
      type: AuditEventType.VALIDATION_ERROR,
      conversationId,
      toolName,
      success: false,
      metadata: { field },
      error
    });
  }

  /**
   * 停止日誌記錄器
   */
  async stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
  }

  /**
   * 讀取審計日誌
   * @param {Object} options - 讀取選項
   * @returns {Promise<Array>} 日誌條目數組
   */
  async read(options = {}) {
    const {
      limit = 1000,
      offset = 0,
      type = null,
      conversationId = null,
      startDate = null,
      endDate = null
    } = options;

    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n');

      let entries = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(entry => entry !== null);

      // 應用過濾器
      if (type) {
        entries = entries.filter(e => e.type === type);
      }

      if (conversationId) {
        entries = entries.filter(e => e.conversationId === conversationId);
      }

      if (startDate) {
        const start = new Date(startDate).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
      }

      if (endDate) {
        const end = new Date(endDate).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
      }

      // 應用分頁
      return entries.slice(offset, offset + limit);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

/**
 * 全局審計日誌記錄器
 */
export const globalAuditLogger = new AuditLogger();

export default AuditLogger;
