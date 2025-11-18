/**
 * 綜合測試文件
 * 驗證所有性能、可靠性和新功能改進
 */

import { QueryCache } from './src/utils/query-cache.js';
import { withTimeout, TIMEOUT_CONFIG } from './src/utils/timeout.js';
import { RateLimiter } from './src/security/rate-limiter.js';
import {
  sanitizeText,
  validateConversationId,
  validateNumberRange,
  validateArray
} from './src/security/input-validator.js';
import { Logger, createLogger } from './src/utils/logger.js';
import { MetricsCollector } from './src/monitoring/metrics.js';
import { HealthChecker } from './src/health/index.js';
import { AuditLogger } from './src/security/audit-log.js';

console.log('🧪 開始測試所有改進功能...\n');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   錯誤: ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// ==================== 查詢緩存測試 ====================
console.log('📦 測試查詢緩存系統...');

test('QueryCache: 創建實例', () => {
  const cache = new QueryCache(10, 1000);
  assert(cache.maxSize === 10);
  assert(cache.maxAge === 1000);
});

test('QueryCache: 設置和獲取查詢', () => {
  const cache = new QueryCache(10, 60000);
  const keywords = [{ word: 'test', weight: 1 }];
  const result = { data: 'cached result' };

  cache.setQuery(keywords, 'conv1', {}, result);
  const retrieved = cache.getQuery(keywords, 'conv1', {});

  assert(retrieved !== null);
  assert(retrieved.data === 'cached result');
});

test('QueryCache: 緩存命中統計', () => {
  const cache = new QueryCache(10, 60000);
  const keywords = [{ word: 'hello', weight: 1 }];

  cache.setQuery(keywords, 'conv1', {}, { data: 'test' });
  cache.getQuery(keywords, 'conv1', {});
  cache.getQuery(keywords, 'conv1', {});
  cache.getQuery([{ word: 'nonexistent', weight: 1 }], 'conv1', {});

  const stats = cache.getStats();
  assertEquals(stats.hits, 2);
  assertEquals(stats.misses, 1);
});

test('QueryCache: 失效對話緩存', () => {
  const cache = new QueryCache(10, 60000);
  cache.setQuery([{ word: 'test', weight: 1 }], 'conv1', {}, { data: '1' });
  cache.setQuery([{ word: 'test', weight: 1 }], 'conv2', {}, { data: '2' });

  const invalidated = cache.invalidateConversation('conv1');
  assert(invalidated === 1);

  const result = cache.getQuery([{ word: 'test', weight: 1 }], 'conv1', {});
  assert(result === null);
});

// ==================== 超時處理測試 ====================
console.log('\n⏱️  測試超時處理...');

test('Timeout: 正常完成', async () => {
  const promise = Promise.resolve('success');
  const result = await withTimeout(promise, 1000, 'Test timeout');
  assertEquals(result, 'success');
});

test('Timeout: 超時錯誤', async () => {
  const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 100));

  try {
    await withTimeout(slowPromise, 10, 'Should timeout');
    throw new Error('Should have thrown timeout error');
  } catch (error) {
    assert(error.message.includes('timeout'));
  }
});

test('Timeout: 配置常量存在', () => {
  assert(typeof TIMEOUT_CONFIG.SEARCH === 'number');
  assert(typeof TIMEOUT_CONFIG.BACKUP === 'number');
  assert(TIMEOUT_CONFIG.SEARCH > 0);
});

// ==================== 速率限制測試 ====================
console.log('\n🚦 測試速率限制器...');

test('RateLimiter: 創建實例', () => {
  const limiter = new RateLimiter(5, 1000);
  assert(limiter.maxRequests === 5);
});

test('RateLimiter: 允許正常請求', () => {
  const limiter = new RateLimiter(10, 60000);
  const result = limiter.checkLimit('user1', 'tool1');
  assert(result.allowed === true);
  assert(result.remaining === 9);
});

test('RateLimiter: 超過限制阻止請求', () => {
  const limiter = new RateLimiter(3, 60000);

  for (let i = 0; i < 3; i++) {
    limiter.checkLimit('user2', 'tool1');
  }

  const result = limiter.checkLimit('user2', 'tool1');
  assert(result.allowed === false);
  assertEquals(result.remaining, 0);
});

test('RateLimiter: 獲取統計信息', () => {
  const limiter = new RateLimiter(10, 60000);
  limiter.checkLimit('user3', 'tool1');
  limiter.checkLimit('user4', 'tool1');

  const stats = limiter.getStats();
  assert(stats.activeConversations >= 2);
});

test('RateLimiter: 解除阻止', () => {
  const limiter = new RateLimiter(2, 60000);

  limiter.checkLimit('user5', 'tool1');
  limiter.checkLimit('user5', 'tool1');
  limiter.checkLimit('user5', 'tool1'); // 觸發阻止

  limiter.unblock('user5');

  const result = limiter.checkLimit('user5', 'tool1');
  assert(result.allowed === true);
});

// ==================== 輸入驗證測試 ====================
console.log('\n🛡️  測試輸入驗證...');

test('Input: 清理有效文本', () => {
  const result = sanitizeText('Hello World!');
  assertEquals(result, 'Hello World!');
});

test('Input: 移除控制字符', () => {
  const dirty = 'Hello\x00\x01World';
  const result = sanitizeText(dirty);
  assertEquals(result, 'HelloWorld');
});

test('Input: 拒絕過長文本', () => {
  const longText = 'a'.repeat(200000);

  try {
    sanitizeText(longText, { maxLength: 100000 });
    throw new Error('Should have thrown error');
  } catch (error) {
    assert(error.message.includes('too long'));
  }
});

test('Input: 驗證有效對話ID', () => {
  const result = validateConversationId('valid-conversation_123');
  assertEquals(result, 'valid-conversation_123');
});

test('Input: 拒絕無效對話ID', () => {
  try {
    validateConversationId('invalid@conversation!');
    throw new Error('Should have thrown error');
  } catch (error) {
    assert(error.message.includes('Invalid'));
  }
});

test('Input: 驗證數字範圍', () => {
  const result = validateNumberRange(5, 0, 10);
  assertEquals(result, 5);
});

test('Input: 拒絕超範圍數字', () => {
  try {
    validateNumberRange(15, 0, 10);
    throw new Error('Should have thrown error');
  } catch (error) {
    assert(error.message.includes('between'));
  }
});

test('Input: 驗證數組', () => {
  const result = validateArray([1, 2, 3], { maxLength: 5 });
  assertEquals(result.length, 3);
});

// ==================== 日誌系統測試 ====================
console.log('\n📝 測試結構化日誌系統...');

test('Logger: 創建實例', () => {
  const logger = createLogger('test-module');
  assert(logger.context === 'test-module');
});

test('Logger: 設置最低級別', () => {
  const logger = new Logger('test', 'WARN');
  assert(logger.minLevel === 'WARN');
  assert(logger.shouldLog('ERROR') === true);
  assert(logger.shouldLog('INFO') === false);
});

test('Logger: 創建子日誌器', () => {
  const logger = createLogger('parent');
  const child = logger.child('child');
  assert(child.context === 'parent.child');
});

// ==================== 性能指標測試 ====================
console.log('\n📊 測試性能指標收集器...');

test('Metrics: 創建實例', () => {
  const metrics = new MetricsCollector();
  assert(metrics.requestCount === 0);
});

test('Metrics: 記錄請求', () => {
  const metrics = new MetricsCollector();
  metrics.recordRequest({ duration: 100, success: true, toolName: 'test' });

  assert(metrics.requestCount === 1);
  assert(metrics.successCount === 1);
});

test('Metrics: 記錄失敗請求', () => {
  const metrics = new MetricsCollector();
  metrics.recordRequest({ duration: 200, success: false, toolName: 'test', error: new Error('test') });

  assert(metrics.errorCount === 1);
});

test('Metrics: 獲取統計信息', () => {
  const metrics = new MetricsCollector();
  metrics.recordRequest({ duration: 50, success: true, toolName: 'tool1' });
  metrics.recordRequest({ duration: 100, success: true, toolName: 'tool1' });

  const stats = metrics.getMetrics();
  assert(stats.requests.total === 2);
  assert(parseFloat(stats.latency.avg) > 0);
});

test('Metrics: 緩存統計', () => {
  const metrics = new MetricsCollector();
  metrics.recordCacheAccess(true);
  metrics.recordCacheAccess(true);
  metrics.recordCacheAccess(false);

  const stats = metrics.getMetrics();
  assertEquals(stats.cache.hits, 2);
  assertEquals(stats.cache.misses, 1);
});

test('Metrics: 按工具分類統計', () => {
  const metrics = new MetricsCollector();
  metrics.recordRequest({ duration: 100, success: true, toolName: 'search', conversationId: 'test' });
  metrics.recordRequest({ duration: 150, success: true, toolName: 'search', conversationId: 'test' });

  const stats = metrics.getMetrics();
  assert(stats.toolStats.search.count === 2);
});

// ==================== 健康檢查測試 ====================
console.log('\n💚 測試健康檢查系統...');

test('Health: 創建實例', () => {
  const managers = { shortTerm: new Map(), longTerm: new Map() };
  const metrics = new MetricsCollector();
  const checker = new HealthChecker(managers, metrics);

  assert(checker !== null);
});

test('Health: 註冊檢查', () => {
  const managers = { shortTerm: new Map(), longTerm: new Map() };
  const metrics = new MetricsCollector();
  const checker = new HealthChecker(managers, metrics);

  checker.registerCheck('custom', async () => ({ status: 'healthy', message: 'OK' }));
  assert(checker.checks.has('custom'));
});

test('Health: 執行健康檢查', async () => {
  const managers = { shortTerm: new Map(), longTerm: new Map() };
  const metrics = new MetricsCollector();
  const checker = new HealthChecker(managers, metrics);

  const result = await checker.checkHealth();
  assert(result.status !== undefined);
  assert(result.timestamp !== undefined);
});

test('Health: 獲取簡單狀態', async () => {
  const managers = { shortTerm: new Map(), longTerm: new Map() };
  const metrics = new MetricsCollector();
  const checker = new HealthChecker(managers, metrics);

  const result = await checker.getSimpleHealth();
  assert(result.status !== undefined);
  assert(typeof result.uptime === 'number');
});

// ==================== 審計日誌測試 ====================
console.log('\n🔍 測試審計日誌系統...');

test('Audit: 創建實例', () => {
  const audit = new AuditLogger('/tmp/test-audit.log', { enableFileLogging: false });
  assert(audit !== null);
});

test('Audit: 記錄事件', async () => {
  const audit = new AuditLogger('/tmp/test-audit.log', { enableFileLogging: false, enableConsoleLogging: false });

  await audit.log({
    type: 'tool_call',
    conversationId: 'test',
    toolName: 'test_tool',
    success: true
  });

  assert(audit.buffer.length === 1);
});

test('Audit: 緩衝區刷新', async () => {
  const audit = new AuditLogger('/tmp/test-audit2.log', { enableFileLogging: false, enableConsoleLogging: false });

  for (let i = 0; i < 5; i++) {
    await audit.log({
      type: 'test',
      conversationId: 'test',
      success: true
    });
  }

  assert(audit.buffer.length > 0);
  await audit.flush();
  // 由於禁用了文件記錄，緩衝區應該被清空
});

// ==================== 總結 ====================
console.log('\n' + '='.repeat(60));
console.log('測試完成！');
console.log('='.repeat(60));
console.log(`總計: ${testsRun} 個測試`);
console.log(`✅ 通過: ${testsPassed}`);
console.log(`❌ 失敗: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 所有測試通過！所有改進功能運作正常。');
  process.exit(0);
}
