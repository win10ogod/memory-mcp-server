/**
 * 短期记忆 MCP 工具定义
 */

import { z } from 'zod';
import { ShortTermMemoryManager } from '../memory/short-term.js';
import { StorageManager } from '../memory/storage.js';

/**
 * 创建短期记忆工具定义
 * @param {ShortTermMemoryManager} memoryManager - 记忆管理器实例
 * @param {StorageManager} storageManager - 存储管理器实例
 * @returns {Array} MCP 工具定义数组
 */
export function createShortTermTools(memoryManager, storageManager) {
  return [
    {
      name: 'add_short_term_memory',
      description: 'Add a new short-term memory entry from recent conversation messages. The memory will be indexed by keywords and scored based on relevance over time.',
      inputSchema: z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
          content: z.string().describe('Message content'),
          timestamp: z.number().optional().describe('Unix timestamp in milliseconds')
        })).describe('Array of recent messages to create memory from'),
        conversation_id: z.string().describe('Unique identifier for the conversation'),
        roleWeights: z.object({
          user: z.number().optional(),
          assistant: z.number().optional(),
          system: z.number().optional()
        }).optional().describe('Optional weights for different roles when extracting keywords (default: user=2.7, assistant=2.0, system=1.0)')
      }),
      handler: async (args) => {
        try {
          const success = await memoryManager.addMemory(
            args.messages,
            args.conversation_id,
            { roleWeights: args.roleWeights }
          );

          if (success) {
            await storageManager.saveShortTermMemories(memoryManager.getMemories());
            return {
              success: true,
              message: 'Memory added successfully',
              totalMemories: memoryManager.getMemories().length
            };
          } else {
            return {
              success: false,
              message: 'Failed to add memory (possibly empty content)'
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
      name: 'search_short_term_memories',
      description: 'Search and retrieve relevant short-term memories based on recent conversation context. Returns top relevant, next relevant, and random flashback memories.',
      inputSchema: z.object({
        recentMessages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string()
        })).describe('Recent messages to search against'),
        conversation_id: z.string().describe('Current conversation ID'),
        roleWeights: z.object({
          user: z.number().optional(),
          assistant: z.number().optional(),
          system: z.number().optional()
        }).optional()
      }),
      handler: async (args) => {
        try {
          const results = await memoryManager.searchRelevantMemories(
            args.recentMessages,
            args.conversation_id,
            { roleWeights: args.roleWeights }
          );

          // Format memories for output
          const formatMemory = (item) => ({
            text: item.memory.text,
            conversation_id: item.memory.conversation_id,
            timestamp: item.memory.time_stamp.toISOString(),
            score: item.memory.score,
            relevance: item.relevance,
            keywords: item.memory.keywords.slice(0, 10).map(kw => kw.word)
          });

          await storageManager.saveShortTermMemories(memoryManager.getMemories());

          return {
            topRelevant: results.topRelevant.map(formatMemory),
            nextRelevant: results.nextRelevant.map(formatMemory),
            randomFlashback: results.randomFlashback.map(formatMemory),
            totalSearched: memoryManager.getMemories().length
          };
        } catch (error) {
          return {
            error: error.message
          };
        }
      }
    },

    {
      name: 'delete_short_term_memories',
      description: 'Delete short-term memories matching a keyword or regex pattern.',
      inputSchema: z.object({
        pattern: z.string().describe('String keyword or regex pattern to match (e.g., "keyword" or "/pattern/i")'),
        conversation_id: z.string().describe('Conversation ID for storage')
      }),
      handler: async (args) => {
        try {
          // Parse regex if pattern is in /.../ format
          let searchPattern = args.pattern;
          const regexMatch = args.pattern.match(/^\/(.+)\/([gimsuy]*)$/);
          
          if (regexMatch) {
            searchPattern = new RegExp(regexMatch[1], regexMatch[2]);
          }

          const deletedCount = memoryManager.deleteMemories(searchPattern);
          await storageManager.saveShortTermMemories(memoryManager.getMemories());

          return {
            success: true,
            deletedCount,
            remainingCount: memoryManager.getMemories().length,
            message: `Deleted ${deletedCount} memor${deletedCount === 1 ? 'y' : 'ies'}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },

    {
      name: 'get_memory_stats',
      description: 'Get statistical information about short-term memories.',
      inputSchema: z.object({
        conversation_id: z.string().optional().describe('Optional conversation ID for context')
      }),
      handler: async (args) => {
        try {
          const stats = memoryManager.getStats();

          return {
            ...stats,
            oldestMemory: stats.oldestMemory ? new Date(stats.oldestMemory).toISOString() : null,
            newestMemory: stats.newestMemory ? new Date(stats.newestMemory).toISOString() : null,
            lastCleanup: new Date(stats.lastCleanup).toISOString()
          };
        } catch (error) {
          return {
            error: error.message
          };
        }
      }
    },

    {
      name: 'cleanup_memories',
      description: 'Manually trigger cleanup of old or low-relevance short-term memories. This removes memories older than 1 year or with very low relevance scores, keeping at least 512 memories.',
      inputSchema: z.object({
        conversation_id: z.string().describe('Conversation ID for storage')
      }),
      handler: async (args) => {
        try {
          const removedCount = memoryManager.cleanup();
          await storageManager.saveShortTermMemories(memoryManager.getMemories());

          return {
            success: true,
            removedCount,
            remainingCount: memoryManager.getMemories().length,
            message: `Cleanup complete: removed ${removedCount} memor${removedCount === 1 ? 'y' : 'ies'}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    },

    {
      name: 'get_frequent_conversation',
      description: 'Get the most frequently mentioned conversation ID in memories.',
      inputSchema: z.object({}),
      handler: async (args) => {
        try {
          const mostFrequent = memoryManager.getMostFrequentConversation();

          return {
            conversation_id: mostFrequent,
            message: mostFrequent 
              ? `Most frequent conversation: ${mostFrequent}`
              : 'No memories found'
          };
        } catch (error) {
          return {
            error: error.message
          };
        }
      }
    }
  ];
}

export default createShortTermTools;

