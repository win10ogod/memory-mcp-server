#!/usr/bin/env node

/**
 * Memory MCP Server
 * A Model Context Protocol server providing dynamic short-term and long-term memory management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { ShortTermMemoryManager } from './memory/short-term.js';
import { LongTermMemoryManager } from './memory/long-term.js';
import { StorageManager, flushAllWrites } from './memory/storage.js';
import { createShortTermTools } from './tools/short-term-tools.js';
import { createLongTermTools } from './tools/long-term-tools.js';
import { createBackupTools } from './tools/backup-tools.js';
import { createSearchTools } from './tools/search-tools.js';
import { zodToJsonSchema } from './utils/zod-to-json-schema.js';
import { LRUCache } from './utils/lru-cache.js';
import { QueryCache } from './utils/query-cache.js';
import { withTimeout, TIMEOUT_CONFIG } from './utils/timeout.js';
import { createResources } from './resources/index.js';
import { createPrompts } from './prompts/index.js';
import { createLogger } from './utils/logger.js';
import { globalMetrics } from './monitoring/metrics.js';
import { createHealthChecker } from './health/index.js';
import { globalRateLimiter } from './security/rate-limiter.js';
import { globalAuditLogger } from './security/audit-log.js';
import { validateConversationId } from './security/input-validator.js';

// 創建日誌記錄器
const logger = createLogger('mcp-server');

// 使用 LRU 缓存管理器实例，防止内存泄漏
// 最多缓存 100 个对话，30 分钟未使用自动清理
const shortTermManagers = new LRUCache(100, 30 * 60 * 1000);
const longTermManagers = new LRUCache(100, 30 * 60 * 1000);
const storageManagers = new LRUCache(100, 30 * 60 * 1000);

// 查詢緩存實例
const queryCache = new QueryCache(50, 5 * 60 * 1000);

// 健康檢查器
let healthChecker = null;

// 定期清理过期的管理器
setInterval(() => {
  const stCleaned = shortTermManagers.cleanExpired();
  const ltCleaned = longTermManagers.cleanExpired();
  const sCleaned = storageManagers.cleanExpired();

  if (stCleaned > 0 || ltCleaned > 0 || sCleaned > 0) {
    console.error(`[Cleanup] Removed ${stCleaned} short-term, ${ltCleaned} long-term, ${sCleaned} storage managers`);
  }
}, 5 * 60 * 1000); // 每 5 分钟清理一次

/**
 * 获取或创建短期记忆管理器
 * @param {string} conversationId
 * @returns {Promise<ShortTermMemoryManager>}
 */
async function getShortTermManager(conversationId) {
  let manager = shortTermManagers.get(conversationId);

  if (!manager) {
    manager = new ShortTermMemoryManager();
    const storage = getStorageManager(conversationId);
    const memories = await storage.loadShortTermMemories();
    manager.loadMemories(memories);
    shortTermManagers.set(conversationId, manager);
  }

  return manager;
}

/**
 * 获取或创建长期记忆管理器
 * @param {string} conversationId
 * @returns {Promise<LongTermMemoryManager>}
 */
async function getLongTermManager(conversationId) {
  let manager = longTermManagers.get(conversationId);

  if (!manager) {
    manager = new LongTermMemoryManager();
    const storage = getStorageManager(conversationId);
    const memories = await storage.loadLongTermMemories();
    manager.loadMemories(memories);
    longTermManagers.set(conversationId, manager);
  }

  return manager;
}

/**
 * 获取或创建存储管理器
 * @param {string} conversationId
 * @returns {StorageManager}
 */
function getStorageManager(conversationId) {
  let manager = storageManagers.get(conversationId);

  if (!manager) {
    manager = new StorageManager(conversationId);
    storageManagers.set(conversationId, manager);
  }

  return manager;
}

/**
 * 创建 MCP 服务器
 */
async function createServer() {
  const server = new Server(
    {
      name: 'memory-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
    }
  );

  // 工具注册表
  const toolRegistry = new Map();

  // 注册工具的辅助函数
  function registerTool(toolDef, scope) {
    toolRegistry.set(toolDef.name, { ...toolDef, scope });
  }

  // 动态创建工具（使用默认 conversation_id）
  const defaultConversationId = 'default';
  const defaultShortTermManager = await getShortTermManager(defaultConversationId);
  const defaultLongTermManager = await getLongTermManager(defaultConversationId);
  const defaultStorageManager = getStorageManager(defaultConversationId);

  // 注册所有短期记忆工具
  const shortTermTools = createShortTermTools(defaultShortTermManager, defaultStorageManager);
  shortTermTools.forEach(tool => registerTool(tool, 'short-term'));

  // 注册所有长期记忆工具
  const longTermTools = createLongTermTools(defaultLongTermManager, defaultStorageManager);
  longTermTools.forEach(tool => registerTool(tool, 'long-term'));

  // 註冊備份與還原工具
  const backupTools = createBackupTools(getShortTermManager, getLongTermManager, getStorageManager);
  backupTools.forEach(tool => registerTool(tool, 'backup'));

  // 註冊高級搜索工具
  const searchTools = createSearchTools(getShortTermManager, getLongTermManager);
  searchTools.forEach(tool => registerTool(tool, 'search'));

  // 註冊健康檢查工具
  registerTool({
    name: 'health_check',
    description: '獲取服務器健康狀態和性能指標',
    inputSchema: z.object({
      detailed: z.boolean().default(false).describe('是否返回詳細報告')
    }),
    scope: 'system',
    async handler(args) {
      if (args.detailed) {
        return await healthChecker.getHealthReport();
      } else {
        return await healthChecker.getSimpleHealth();
      }
    }
  }, 'system');

  // 註冊性能指標工具
  registerTool({
    name: 'get_metrics',
    description: '獲取服務器性能指標',
    inputSchema: z.object({}),
    scope: 'system',
    async handler() {
      return globalMetrics.getMetrics();
    }
  }, 'system');

  // 註冊查詢緩存統計工具
  registerTool({
    name: 'get_cache_stats',
    description: '獲取查詢緩存統計信息',
    inputSchema: z.object({}),
    scope: 'system',
    async handler() {
      return queryCache.getStats();
    }
  }, 'system');

  // 創建 Resources 和 Prompts 處理器
  const { resources, readResource } = createResources(
    getShortTermManager,
    getLongTermManager,
    getStorageManager
  );
  const { prompts, getPrompt } = createPrompts();

  // 初始化健康檢查器
  healthChecker = createHealthChecker(
    { shortTerm: shortTermManagers, longTerm: longTermManagers, storage: storageManagers },
    globalMetrics
  );

  // 处理 list_tools 请求
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = Array.from(toolRegistry.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema)
    }));

    return { tools };
  });

  // 处理 call_tool 请求
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const startTime = Date.now();
    let conversationId = 'unknown';
    let success = false;
    let result = null;
    let error = null;

    try {
      const toolDef = toolRegistry.get(toolName);

      if (!toolDef) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      // 验证参数
      const validatedArgs = toolDef.inputSchema.parse(request.params.arguments);

      // 驗證並清理 conversation_id
      conversationId = validatedArgs.conversation_id || defaultConversationId;
      try {
        validateConversationId(conversationId);
      } catch (validationError) {
        await globalAuditLogger.logValidationError({
          conversationId,
          toolName,
          field: 'conversation_id',
          error: validationError
        });
        throw validationError;
      }

      // 檢查速率限制
      const rateLimitResult = globalRateLimiter.checkLimit(conversationId, toolName);
      if (!rateLimitResult.allowed) {
        await globalAuditLogger.logRateLimitExceeded({
          conversationId,
          toolName,
          limit: globalRateLimiter.maxRequests,
          current: globalRateLimiter.maxRequests
        });
        throw new Error(rateLimitResult.reason);
      }

      logger.debug('Tool call started', { toolName, conversationId });

      // 執行工具（帶超時）
      const toolScope = toolDef.scope;
      const timeout = TIMEOUT_CONFIG.SEARCH || 5000;

      let manager, storage;
      if (toolScope === 'short-term' || toolName.includes('short_term')) {
        manager = await getShortTermManager(conversationId);
        storage = getStorageManager(conversationId);
        const tools = createShortTermTools(manager, storage, queryCache);
        const tool = tools.find(t => t.name === toolName);
        result = await withTimeout(tool.handler(validatedArgs), timeout, `Tool ${toolName} timeout`);
      } else if (toolScope === 'long-term' || toolName.includes('long_term')) {
        manager = await getLongTermManager(conversationId);
        storage = getStorageManager(conversationId);
        const tools = createLongTermTools(manager, storage);
        const tool = tools.find(t => t.name === toolName);
        result = await withTimeout(tool.handler(validatedArgs), timeout, `Tool ${toolName} timeout`);
      } else if (toolScope === 'backup') {
        const tools = createBackupTools(getShortTermManager, getLongTermManager, getStorageManager);
        const tool = tools.find(t => t.name === toolName);
        result = await withTimeout(tool.handler(validatedArgs), TIMEOUT_CONFIG.BACKUP, `Tool ${toolName} timeout`);
      } else if (toolScope === 'search') {
        const tools = createSearchTools(getShortTermManager, getLongTermManager);
        const tool = tools.find(t => t.name === toolName);
        result = await withTimeout(tool.handler(validatedArgs), timeout, `Tool ${toolName} timeout`);
      } else {
        // 系統工具或其他工具
        result = await withTimeout(toolDef.handler(validatedArgs), timeout, `Tool ${toolName} timeout`);
      }

      success = true;
      const duration = Date.now() - startTime;

      // 記錄成功的審計日誌
      await globalAuditLogger.logToolCall({
        conversationId,
        toolName,
        success: true,
        args: validatedArgs,
        result,
        duration
      });

      // 記錄性能指標
      globalMetrics.recordRequest({ duration, success: true, toolName, conversationId });

      logger.info('Tool call completed', { toolName, conversationId, duration });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (err) {
      error = err;
      const duration = Date.now() - startTime;

      // 記錄失敗的審計日誌
      await globalAuditLogger.logToolCall({
        conversationId,
        toolName,
        success: false,
        args: request.params.arguments,
        error: err,
        duration
      });

      // 記錄性能指標
      globalMetrics.recordRequest({ duration, success: false, toolName, conversationId, error: err });

      logger.error('Tool call failed', { toolName, conversationId, error: err.message, duration });

      // 處理不同類型的錯誤
      if (err.name === 'ZodError') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid arguments: ${JSON.stringify(err.errors, null, 2)}`
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${err.message}`
          }
        ],
        isError: true
      };
    }
  });

  // 處理 list_resources 請求
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources };
  });

  // 處理 read_resource 請求
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    try {
      return await readResource(uri);
    } catch (error) {
      console.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  });

  // 處理 list_prompts 請求
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts };
  });

  // 處理 get_prompt 請求
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await getPrompt(name, args);
    } catch (error) {
      console.error(`Error getting prompt ${name}:`, error);
      throw error;
    }
  });

  return server;
}

/**
 * 优雅关机处理
 */
async function gracefulShutdown(signal) {
  logger.info(`Shutting down gracefully`, { signal });

  try {
    // 刷新所有待写入的数据
    logger.info('Flushing pending writes');
    await flushAllWrites();

    // 刷新審計日誌
    logger.info('Flushing audit logs');
    await globalAuditLogger.stop();

    // 停止速率限制器
    logger.info('Stopping rate limiter');
    globalRateLimiter.stop();

    // 清理緩存
    logger.info('Clearing caches');
    queryCache.clear();

    // 清理管理器缓存
    logger.info('Clearing manager caches');
    shortTermManagers.clear();
    longTermManagers.clear();
    storageManagers.clear();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

/**
 * 启动服务器
 */
async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    logger.info('Memory MCP Server running on stdio');
    logger.info('Server initialized with enhanced capabilities', {
      features: [
        'Short-term and long-term memory management',
        'Query result caching',
        'Rate limiting and security',
        'Health monitoring and metrics',
        'Backup and restore',
        'Advanced search',
        'Audit logging'
      ]
    });

    // 注册优雅关机处理器
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    // 捕获未处理的异常
    process.on('uncaughtException', (error) => {
      console.error('[Fatal] Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Fatal] Unhandled rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

main();

export { createServer };

