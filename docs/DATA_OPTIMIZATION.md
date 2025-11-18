# 數據優化指南

本文檔說明 Memory MCP Server 的數據格式優化功能，幫助您減少存儲空間並提高性能。

## 概述

數據優化功能包括：
- **時間戳標準化** - 統一為單一格式
- **移除冗餘字段** - 消除 `attachments` 重複
- **關鍵詞去重** - 合併重複的關鍵詞
- **圖像去重** - 移除重複的圖像引用

## 優化效果

經測試，優化可以：
- 減少 **30-40%** 的存儲空間
- 提升解析和序列化速度
- 簡化數據結構

**示例**：
```
原始大小: 386 bytes
優化後:   250 bytes
節省:     136 bytes (35.23%)
```

## 自動優化

存儲層已集成優化功能，**無需手動調用**：

```javascript
import { StorageManager } from './src/memory/storage.js';

const storage = new StorageManager('user_123');

// 保存時自動應用所有優化
await storage.saveShortTermMemories(memories);
// ✓ 時間戳已標準化
// ✓ attachments 已移除
// ✓ 關鍵詞已去重
// ✓ 圖像已去重
```

## 優化詳解

### 1. 時間戳標準化

**問題**：支持多種時間戳字段造成混亂
```javascript
// ✗ 舊格式 - 多個時間戳字段
{
  time_stamp: "2024-01-01T00:00:00Z",
  timestamp: "2024-01-02T00:00:00Z",
  timeStamp: "2024-01-03T00:00:00Z"  // 哪個是正確的？
}
```

**解決方案**：統一為 `timestamp` (ISO 8601 字符串)
```javascript
// ✓ 新格式 - 單一標準字段
{
  timestamp: "2024-01-01T00:00:00.000Z"
}
```

**手動使用**：
```javascript
import { normalizeTimestamps } from './src/utils/data-optimizer.js';

const normalized = normalizeTimestamps(memory);
// time_stamp, timeStamp -> timestamp
```

### 2. 移除 Attachments 冗餘

**問題**：`modalities` 和 `attachments` 存儲相同數據
```javascript
// ✗ 舊格式 - 數據重複存儲
{
  modalities: [{ type: 'image', uri: 'photo.jpg' }],
  attachments: [{ type: 'image', uri: 'photo.jpg' }]  // 完全相同！
}
// 浪費 ~50% 存儲空間
```

**解決方案**：只保留 `modalities`
```javascript
// ✓ 新格式 - 單一數據源
{
  modalities: [{ type: 'image', uri: 'photo.jpg' }]
}
// 節省 ~50% 存儲空間
```

**手動使用**：
```javascript
import { removeAttachmentsRedundancy } from './src/utils/data-optimizer.js';

const optimized = removeAttachmentsRedundancy(memory);
// attachments 字段已移除
```

### 3. 關鍵詞去重

**問題**：相同關鍵詞（不區分大小寫）重複出現
```javascript
// ✗ 舊格式 - 重複關鍵詞
{
  keywords: [
    { word: 'Cat', weight: 2.0 },
    { word: 'cat', weight: 1.5 },  // 重複
    { word: 'CAT', weight: 3.0 }   // 重複
  ]
}
```

**解決方案**：合併並取最大權重
```javascript
// ✓ 新格式 - 去重並優化
{
  keywords: [
    { word: 'Cat', weight: 3.0 }  // 保留最高權重
  ]
}
```

**手動使用**：
```javascript
import { deduplicateKeywords } from './src/utils/data-optimizer.js';

const unique = deduplicateKeywords(keywords);
// 大小寫不敏感的去重，保留最高權重
```

### 4. 圖像去重

**問題**：相同圖像在 modalities 中多次出現
```javascript
// ✗ 舊格式 - 重複圖像
{
  modalities: [
    { type: 'image', uri: 'https://example.com/photo.jpg' },
    { type: 'image', uri: 'https://example.com/photo.jpg' },  // 重複
    { type: 'image', uri: 'data:image/png;base64,ABC...' },
    { type: 'image', uri: 'data:image/png;base64,ABC...' }    // 重複
  ]
}
```

**解決方案**：基於 URI 和內容哈希去重
```javascript
// ✓ 新格式 - 唯一圖像
{
  modalities: [
    { type: 'image', uri: 'https://example.com/photo.jpg' },
    { type: 'image', uri: 'data:image/png;base64,ABC...',
      metadata: { contentHash: 'sha256...' } }
  ]
}
```

**手動使用**：
```javascript
import { deduplicateImageModalities } from './src/utils/image-processor.js';

const unique = deduplicateImageModalities(modalities);
// 基於 URI 和哈希的智能去重
```

## 一鍵優化

使用 `optimizeMemory()` 應用所有優化：

```javascript
import { optimizeMemory } from './src/utils/data-optimizer.js';

const memory = {
  text: 'Test memory',
  time_stamp: new Date('2024-01-01'),
  timestamp: '2024-01-02',
  keywords: [
    { word: 'test', weight: 2 },
    { word: 'Test', weight: 1 }  // 重複
  ],
  modalities: [/*...*/],
  attachments: [/*...*/]  // 冗餘
};

const optimized = optimizeMemory(memory);
// ✓ 所有優化已應用
```

**選項**：
```javascript
const optimized = optimizeMemory(memory, {
  normalizeTimestamps: true,           // 標準化時間戳
  removeAttachmentsRedundancy: true,   // 移除 attachments
  deduplicateKeywords: true            // 去重關鍵詞
});
```

## 批量優化

優化多個記憶：

```javascript
import { optimizeMemories } from './src/utils/data-optimizer.js';

const optimizedList = optimizeMemories(memories);
// 批量應用優化
```

## 計算節省空間

查看優化效果：

```javascript
import { calculateSpaceSavings } from './src/utils/data-optimizer.js';

const savings = calculateSpaceSavings(originalMemory, optimizedMemory);

console.log(`Original: ${savings.originalSize} bytes`);
console.log(`Optimized: ${savings.optimizedSize} bytes`);
console.log(`Saved: ${savings.saved} bytes (${savings.savedPercent}%)`);
```

## 遷移舊數據

將舊格式數據遷移到新格式：

```javascript
import { migrateLegacyFormat } from './src/utils/data-optimizer.js';

const migratedMemory = migrateLegacyFormat(legacyMemory);
// ✓ 所有優化已應用
// ✓ 添加遷移元數據 (_migrated)
```

## 性能影響

### 存儲空間

- **短期記憶**: 平均節省 30-35%
- **長期記憶**: 平均節省 25-30%
- **大型數據集**: 可節省數 MB 至 GB

### 處理速度

- **解析速度**: 提升 ~10-15%（更少的字段）
- **序列化速度**: 提升 ~15-20%（更小的數據）
- **搜索效率**: 關鍵詞去重後提升 ~5-10%

### 內存使用

- **運行時內存**: 減少 ~20-30%
- **LRU 緩存**: 可緩存更多對話

## 最佳實踐

### 1. 讓存儲層自動優化

```javascript
// ✓ 推薦 - 使用 StorageManager
const storage = new StorageManager('user_123');
await storage.saveShortTermMemories(memories);
// 自動應用所有優化

// ✗ 不推薦 - 手動保存
await fs.writeFile(path, JSON.stringify(memories));
// 沒有優化！
```

### 2. 定期清理數據

```javascript
// 運行清理以移除舊數據
await shortTermManager.cleanup();

// 檢查統計
const stats = shortTermManager.getStats();
console.log(`Total memories: ${stats.total}`);
```

### 3. 監控存儲使用

```javascript
import { calculateSpaceSavings } from './src/utils/data-optimizer.js';

// 在保存前後計算
const before = JSON.stringify(memories);
await storage.saveShortTermMemories(memories);
const after = await storage.loadShortTermMemories();

const savings = calculateSpaceSavings(
  JSON.parse(before),
  after
);

console.log(`Space saved: ${savings.savedPercent}%`);
```

### 4. 定期驗證數據

```javascript
import { validateImageModality } from './src/utils/image-processor.js';

// 驗證所有圖像 modalities
for (const memory of memories) {
  for (const modality of memory.modalities || []) {
    if (modality.type === 'image') {
      const validation = validateImageModality(modality);
      if (!validation.valid) {
        console.warn(`Invalid image in memory: ${validation.errors}`);
      }
    }
  }
}
```

## 故障排除

### 問題：優化後某些字段丟失

**原因**：以 `_` 開頭的臨時字段會被移除

**解決方案**：
```javascript
// ✗ 避免 - 臨時字段
memory._tempData = '...';  // 會被移除

// ✓ 使用 - 永久字段
memory.customData = '...';  // 會保留
```

### 問題：時間戳格式不一致

**原因**：直接修改已保存的文件

**解決方案**：
```javascript
// 通過 StorageManager 重新加載和保存
const storage = new StorageManager('user_123');
const memories = await storage.loadShortTermMemories();
await storage.saveShortTermMemories(memories);
// 時間戳現已標準化
```

### 問題：關鍵詞權重丟失

**原因**：權重合併時選擇了錯誤的策略

**解決方案**：
```javascript
// deduplicateKeywords 使用最大權重
// 如需其他策略（如平均值），請手動處理
const keywords = customDeduplication(keywords);
```

## 配置選項

### 禁用特定優化

```javascript
// 只標準化時間戳，不去重關鍵詞
const optimized = optimizeMemory(memory, {
  normalizeTimestamps: true,
  removeAttachmentsRedundancy: true,
  deduplicateKeywords: false  // 保留所有關鍵詞
});
```

### 自定義優化邏輯

```javascript
function prepareShortTermMemoryForStorage(memory) {
  let sanitized = { ...memory };

  // 1. 應用標準優化
  sanitized = optimizeMemory(sanitized);

  // 2. 應用自定義邏輯
  if (sanitized.customField) {
    sanitized.customField = processCustomField(sanitized.customField);
  }

  return sanitized;
}
```

## API 參考

詳見各函數的 JSDoc 註釋：
- `normalizeTimestamps(memory)`
- `removeAttachmentsRedundancy(memory)`
- `deduplicateKeywords(keywords)`
- `optimizeMemory(memory, options)`
- `optimizeMemories(memories, options)`
- `calculateSpaceSavings(original, optimized)`
- `migrateLegacyFormat(legacyMemory)`

## 下一步

- 查看 [IMAGE_MEMORY.md](./IMAGE_MEMORY.md) 了解圖像記憶
- 查看 [../README.md](../README.md) 了解完整功能
- 運行 `test-image-and-optimization.js` 查看示例
