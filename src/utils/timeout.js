/**
 * 請求超時處理工具
 * 防止長時間運行的操作阻塞服務器
 */

/**
 * 為 Promise 添加超時限制
 * @param {Promise} promise - 要執行的 Promise
 * @param {number} timeoutMs - 超時時間（毫秒）
 * @param {string} errorMsg - 超時錯誤消息
 * @returns {Promise} 帶超時的 Promise
 */
export async function withTimeout(promise, timeoutMs, errorMsg = 'Operation timeout') {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${errorMsg} (${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
}

/**
 * 超時配置常量
 */
export const TIMEOUT_CONFIG = {
  SEARCH: 5000,        // 搜索操作：5 秒
  ADD_MEMORY: 3000,    // 添加記憶：3 秒
  LOAD_MEMORY: 2000,   // 加載記憶：2 秒
  SAVE_MEMORY: 5000,   // 保存記憶：5 秒
  CLEANUP: 10000,      // 清理操作：10 秒
  BACKUP: 30000,       // 備份操作：30 秒
  RESTORE: 30000       // 還原操作：30 秒
};

/**
 * 創建帶超時的函數包裝器
 * @param {Function} fn - 要包裝的函數
 * @param {number} timeoutMs - 超時時間
 * @param {string} operationName - 操作名稱
 * @returns {Function} 帶超時的函數
 */
export function withTimeoutWrapper(fn, timeoutMs, operationName) {
  return async function(...args) {
    return withTimeout(
      fn.apply(this, args),
      timeoutMs,
      `${operationName} timeout`
    );
  };
}

export default { withTimeout, TIMEOUT_CONFIG, withTimeoutWrapper };
