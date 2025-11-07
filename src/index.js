#!/usr/bin/env node

/**
 * Memory MCP Server
 * A Model Context Protocol server providing dynamic short-term and long-term memory management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { ShortTermMemoryManager } from './memory/short-term.js';
import { LongTermMemoryManager } from './memory/long-term.js';
import { StorageManager } from './memory/storage.js';
import { createShortTermTools } from './tools/short-term-tools.js';
import { createLongTermTools } from './tools/long-term-tools.js';
import { zodToJsonSchema } from './utils/zod-to-json-schema.js';

// 全局管理器映射（按 conversation_id）
const shortTermManagers = new Map();
const longTermManagers = new Map();
const storageManagers = new Map();

/**
 * 获取或创建短期记忆管理器
 * @param {string} conversationId
 * @returns {Promise<ShortTermMemoryManager>}
 */
async function getShortTermManager(conversationId) {
  if (!shortTermManagers.has(conversationId)) {
    const manager = new ShortTermMemoryManager();
    const storage = getStorageManager(conversationId);
    const memories = await storage.loadShortTermMemories();
    manager.loadMemories(memories);
    shortTermManagers.set(conversationId, manager);
  }
  return shortTermManagers.get(conversationId);
}

/**
 * 获取或创建长期记忆管理器
 * @param {string} conversationId
 * @returns {Promise<LongTermMemoryManager>}
 */
async function getLongTermManager(conversationId) {
  if (!longTermManagers.has(conversationId)) {
    const manager = new LongTermMemoryManager();
    const storage = getStorageManager(conversationId);
    const memories = await storage.loadLongTermMemories();
    manager.loadMemories(memories);
    longTermManagers.set(conversationId, manager);
  }
  return longTermManagers.get(conversationId);
}

/**
 * 获取或创建存储管理器
 * @param {string} conversationId
 * @returns {StorageManager}
 */
function getStorageManager(conversationId) {
  if (!storageManagers.has(conversationId)) {
    const manager = new StorageManager(conversationId);
    storageManagers.set(conversationId, manager);
  }
  return storageManagers.get(conversationId);
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
    const toolDef = toolRegistry.get(toolName);

    if (!toolDef) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${toolName}`
          }
        ],
        isError: true
      };
    }

    try {
      // 验证参数
      const validatedArgs = toolDef.inputSchema.parse(request.params.arguments);

      // 如果工具需要特定的 conversation_id，获取对应的管理器
      const conversationId = validatedArgs.conversation_id || defaultConversationId;

      const toolScope = toolDef.scope;

      let manager, storage;
      if (toolScope === 'short-term' || toolName.includes('short_term')) {
        manager = await getShortTermManager(conversationId);
        storage = getStorageManager(conversationId);
        // 重新创建工具以使用正确的管理器
        const tools = createShortTermTools(manager, storage);
        const tool = tools.find(t => t.name === toolName);
        const result = await tool.handler(validatedArgs);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } else if (toolScope === 'long-term' || toolName.includes('long_term')) {
        manager = await getLongTermManager(conversationId);
        storage = getStorageManager(conversationId);
        // 重新创建工具以使用正确的管理器
        const tools = createLongTermTools(manager, storage);
        const tool = tools.find(t => t.name === toolName);
        const result = await tool.handler(validatedArgs);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } else {
        // 对于其他工具，直接调用
        const result = await toolDef.handler(validatedArgs);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    } catch (error) {
      if (error.name === 'ZodError') {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid arguments: ${JSON.stringify(error.errors, null, 2)}`
            }
          ],
          isError: true
        };
      }

      console.error(`Error executing tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

/**
 * 启动服务器
 */
async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
    
    console.error('Memory MCP Server running on stdio');
    console.error('Server initialized with short-term and long-term memory capabilities');
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

main();

export { createServer };

