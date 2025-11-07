/**
 * 长期记忆 MCP 工具定义
 */

import { z } from 'zod';
import { LongTermMemoryManager } from '../memory/long-term.js';
import { StorageManager } from '../memory/storage.js';
import { createContextSnapshot } from '../nlp/keywords.js';

/**
 * 创建长期记忆工具定义
 * @param {LongTermMemoryManager} memoryManager - 记忆管理器实例
 * @param {StorageManager} storageManager - 存储管理器实例
 * @returns {Array} MCP 工具定义数组
 */
export function createLongTermTools(memoryManager, storageManager) {
  return [
    {
      name: 'add_long_term_memory',
      description: 'Add a new long-term memory with a trigger condition. The trigger is JavaScript code that determines when this memory should be activated. Available context: context.messages (array), context.conversation_id (string), context.participants (object). Available functions: match_keys(messages, keywords, scope, depth), match_keys_all(messages, keywords, scope, depth).',
      inputSchema: z.object({
        name: z.string().describe('Unique name for the memory'),
        prompt: z.string().describe('The memory content to be recalled when triggered'),
        trigger: z.string().describe('JavaScript code that returns true/false to determine if memory should activate. Example: "match_keys(context.messages, [\'birthday\'], \'any\') || new Date().getMonth() === 6"'),
        conversation_id: z.string().optional().describe('Conversation ID that owns this memory (defaults to "default")'),
        createdContext: z.string().optional().describe('Optional context about when/why this memory was created'),
        recentMessages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string()
        })).optional().describe('Optional recent messages to auto-generate createdContext')
      }),
      handler: async (args) => {
        try {
          // Auto-generate context if messages provided
          let createdContext = args.createdContext || '';
          if (!createdContext && args.recentMessages) {
            createdContext = createContextSnapshot(args.recentMessages, 4);
          }

          const result = await memoryManager.addMemory({
            name: args.name,
            prompt: args.prompt,
            trigger: args.trigger,
            createdContext
          });

          if (result.success) {
            await storageManager.saveLongTermMemories(memoryManager.getMemories());
            return {
              success: true,
              message: `Memory "${args.name}" added successfully`,
              totalMemories: memoryManager.getMemories().length
            };
          } else {
            return {
              success: false,
              error: result.error
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },

    {
      name: 'update_long_term_memory',
      description: 'Update an existing long-term memory. You can update the trigger condition, prompt content, or add update context.',
      inputSchema: z.object({
        name: z.string().describe('Name of the memory to update'),
        trigger: z.string().optional().describe('New trigger condition (JavaScript code)'),
        prompt: z.string().optional().describe('New memory content'),
        conversation_id: z.string().optional().describe('Conversation ID that owns this memory'),
        updatedContext: z.string().optional().describe('Context about this update'),
        recentMessages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string()
        })).optional().describe('Optional recent messages to auto-generate updatedContext')
      }),
      handler: async (args) => {
        try {
          // Auto-generate context if messages provided
          let updatedContext = args.updatedContext;
          if (!updatedContext && args.recentMessages) {
            updatedContext = createContextSnapshot(args.recentMessages, 4);
          }

          const updates = {
            trigger: args.trigger,
            prompt: args.prompt,
            updatedContext
          };

          // Remove undefined values
          Object.keys(updates).forEach(key => {
            if (updates[key] === undefined) delete updates[key];
          });

          const result = await memoryManager.updateMemory(args.name, updates);

          if (result.success) {
            await storageManager.saveLongTermMemories(memoryManager.getMemories());
            return {
              success: true,
              message: `Memory "${args.name}" updated successfully`
            };
          } else {
            return {
              success: false,
              error: result.error
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },

    {
      name: 'delete_long_term_memory',
      description: 'Delete a long-term memory by name.',
      inputSchema: z.object({
        name: z.string().describe('Name of the memory to delete'),
        conversation_id: z.string().optional().describe('Conversation ID that owns this memory')
      }),
      handler: async (args) => {
        try {
          const success = memoryManager.deleteMemory(args.name);

          if (success) {
            await storageManager.saveLongTermMemories(memoryManager.getMemories());
            return {
              success: true,
              message: `Memory "${args.name}" deleted successfully`,
              remainingMemories: memoryManager.getMemories().length
            };
          } else {
            return {
              success: false,
              message: `Memory "${args.name}" not found`
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },

    {
      name: 'list_long_term_memories',
      description: 'List all long-term memory names and their basic information.',
      inputSchema: z.object({
        conversation_id: z.string().optional().describe('Conversation ID to inspect (defaults to "default")')
      }),
      handler: async (args) => {
        try {
          const memories = memoryManager.getMemories();
          
          return {
            memories: memories.map(mem => ({
              name: mem.name,
              createdAt: mem.createdAt.toISOString(),
              updatedAt: mem.updatedAt?.toISOString(),
              promptPreview: mem.prompt.substring(0, 100) + (mem.prompt.length > 100 ? '...' : '')
            })),
            total: memories.length
          };
        } catch (error) {
          return {
            error: error.message
          };
        }
      }
    },

    {
      name: 'search_long_term_memories',
      description: 'Search and activate relevant long-term memories based on current conversation context. Returns activated memories (whose triggers evaluated to true) and random memories for serendipity.',
      inputSchema: z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string()
        })).describe('Recent conversation messages'),
        conversation_id: z.string().describe('Current conversation ID'),
        participants: z.object({}).passthrough().optional().describe('Optional participants information')
      }),
      handler: async (args) => {
        try {
          const context = {
            messages: args.messages,
            conversation_id: args.conversation_id,
            participants: args.participants || {}
          };

          const results = await memoryManager.searchAndActivateMemories(context);

          const formatMemory = (mem) => ({
            name: mem.name,
            prompt: mem.prompt,
            createdAt: mem.createdAt.toISOString(),
            updatedAt: mem.updatedAt?.toISOString()
          });

          return {
            activated: results.activated.map(formatMemory),
            random: results.random.map(formatMemory),
            totalMemories: memoryManager.getMemories().length,
            formattedText: memoryManager.formatActivatedMemories(results.activated, results.random)
          };
        } catch (error) {
          return {
            error: error.message
          };
        }
      }
    },

    {
      name: 'get_memory_context',
      description: 'Get the creation and update context of a specific long-term memory.',
      inputSchema: z.object({
        name: z.string().describe('Name of the memory'),
        conversation_id: z.string().optional().describe('Conversation ID that owns this memory')
      }),
      handler: async (args) => {
        try {
          const memory = memoryManager.findMemoryByName(args.name);

          if (!memory) {
            return {
              success: false,
              message: `Memory "${args.name}" not found`
            };
          }

          return {
            success: true,
            name: memory.name,
            createdAt: memory.createdAt.toISOString(),
            updatedAt: memory.updatedAt?.toISOString(),
            createdContext: memory.createdContext || null,
            updatedContext: memory.updatedContext || null,
            formattedContext: memoryManager.formatMemoryContext(memory),
            trigger: memory.trigger
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    }
  ];
}

export default createLongTermTools;

