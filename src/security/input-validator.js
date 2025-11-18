/**
 * 輸入驗證與清理
 * 防止惡意輸入和注入攻擊
 */

/**
 * 清理文本輸入
 * @param {string} text - 輸入文本
 * @param {Object} options - 清理選項
 * @returns {string} 清理後的文本
 */
export function sanitizeText(text, options = {}) {
  const {
    maxLength = 100000,        // 最大長度：100KB
    allowNewlines = true,      // 是否允許換行
    allowUnicode = true,       // 是否允許 Unicode
    trimWhitespace = true      // 是否修剪空白
  } = options;

  if (typeof text !== 'string') {
    throw new Error('Input must be a string');
  }

  // 檢查長度
  if (text.length > maxLength) {
    throw new Error(`Input too long (max ${maxLength} characters, got ${text.length})`);
  }

  let sanitized = text;

  // 移除控制字符（保留換行和制表符）
  if (allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // 移除 Unicode 控制字符
  if (!allowUnicode) {
    sanitized = sanitized.replace(/[^\x20-\x7E]/g, '');
  }

  // 修剪空白
  if (trimWhitespace) {
    sanitized = sanitized.trim();
  }

  return sanitized;
}

/**
 * 驗證對話 ID
 * @param {string} id - 對話 ID
 * @returns {string} 驗證後的 ID
 */
export function validateConversationId(id) {
  if (typeof id !== 'string') {
    throw new Error('Conversation ID must be a string');
  }

  // 只允許字母、數字、下劃線和連字符
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error('Invalid conversation ID format (must be 1-64 alphanumeric characters, underscores, or hyphens)');
  }

  return id;
}

/**
 * 驗證記憶名稱
 * @param {string} name - 記憶名稱
 * @returns {string} 驗證後的名稱
 */
export function validateMemoryName(name) {
  if (typeof name !== 'string') {
    throw new Error('Memory name must be a string');
  }

  const sanitized = sanitizeText(name, { maxLength: 256, allowNewlines: false });

  if (sanitized.length === 0) {
    throw new Error('Memory name cannot be empty');
  }

  return sanitized;
}

/**
 * 驗證觸發條件代碼
 * @param {string} code - JavaScript 代碼
 * @returns {string} 驗證後的代碼
 */
export function validateTriggerCode(code) {
  if (typeof code !== 'string') {
    throw new Error('Trigger code must be a string');
  }

  const sanitized = sanitizeText(code, { maxLength: 10000 });

  if (sanitized.length === 0) {
    throw new Error('Trigger code cannot be empty');
  }

  // 檢查危險模式
  const dangerousPatterns = [
    /require\s*\(/i,
    /import\s+/i,
    /process\./i,
    /child_process/i,
    /fs\./i,
    /eval\s*\(/i,
    /Function\s*\(/i,
    /setTimeout/i,
    /setInterval/i,
    /fetch\s*\(/i,
    /XMLHttpRequest/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error(`Trigger code contains prohibited pattern: ${pattern.source}`);
    }
  }

  return sanitized;
}

/**
 * 驗證數字範圍
 * @param {number} value - 數值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {string} name - 參數名稱
 * @returns {number} 驗證後的數值
 */
export function validateNumberRange(value, min, max, name = 'value') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max} (got ${value})`);
  }

  return value;
}

/**
 * 驗證數組
 * @param {Array} arr - 數組
 * @param {Object} options - 驗證選項
 * @returns {Array} 驗證後的數組
 */
export function validateArray(arr, options = {}) {
  const {
    maxLength = 10000,
    minLength = 0,
    itemValidator = null,
    name = 'array'
  } = options;

  if (!Array.isArray(arr)) {
    throw new Error(`${name} must be an array`);
  }

  if (arr.length < minLength) {
    throw new Error(`${name} must have at least ${minLength} items (got ${arr.length})`);
  }

  if (arr.length > maxLength) {
    throw new Error(`${name} must have at most ${maxLength} items (got ${arr.length})`);
  }

  if (itemValidator) {
    return arr.map((item, index) => {
      try {
        return itemValidator(item);
      } catch (error) {
        throw new Error(`${name}[${index}]: ${error.message}`);
      }
    });
  }

  return arr;
}

/**
 * 驗證日期時間字符串
 * @param {string} dateStr - 日期時間字符串
 * @param {string} name - 參數名稱
 * @returns {string} 驗證後的日期時間字符串
 */
export function validateDateTime(dateStr, name = 'date') {
  if (typeof dateStr !== 'string') {
    throw new Error(`${name} must be a string`);
  }

  const date = new Date(dateStr);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`${name} is not a valid date-time string`);
  }

  // 檢查是否是合理的日期範圍（1970-2100）
  const timestamp = date.getTime();
  const minTimestamp = 0; // 1970-01-01
  const maxTimestamp = 4102444800000; // 2100-01-01

  if (timestamp < minTimestamp || timestamp > maxTimestamp) {
    throw new Error(`${name} is out of reasonable range (1970-2100)`);
  }

  return dateStr;
}

/**
 * 安全的 JSON 解析
 * @param {string} jsonStr - JSON 字符串
 * @param {*} defaultValue - 默認值
 * @returns {*} 解析後的對象
 */
export function safeJsonParse(jsonStr, defaultValue = null) {
  try {
    if (typeof jsonStr !== 'string') {
      return defaultValue;
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('JSON parse error:', error.message);
    return defaultValue;
  }
}

export default {
  sanitizeText,
  validateConversationId,
  validateMemoryName,
  validateTriggerCode,
  validateNumberRange,
  validateArray,
  validateDateTime,
  safeJsonParse
};
