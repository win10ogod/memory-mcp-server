/**
 * MCP Resources
 * 提供記憶系統的資源端點，供 AI 查詢系統狀態和資料
 */

import { listConversations } from '../memory/storage.js';

/**
 * 創建資源處理器
 */
export function createResources(getShortTermManager, getLongTermManager, getStorageManager) {
  const resources = [
    {
      uri: 'memory://stats/overview',
      name: 'Memory System Overview',
      description: 'Overall statistics and health of the memory system',
      mimeType: 'application/json'
    },
    {
      uri: 'memory://conversations/list',
      name: 'Conversations List',
      description: 'List all conversations with stored memories',
      mimeType: 'application/json'
    },
    {
      uri: 'memory://stats/conversation/{id}',
      name: 'Conversation Statistics',
      description: 'Detailed statistics for a specific conversation',
      mimeType: 'application/json'
    },
    {
      uri: 'memory://guide/best-practices',
      name: 'Memory Usage Best Practices',
      description: 'Guide on how to effectively use the memory system',
      mimeType: 'text/markdown'
    }
  ];

  /**
   * 處理資源讀取請求
   */
  async function readResource(uri) {
    // Overview statistics
    if (uri === 'memory://stats/overview') {
      const conversations = await listConversations();

      return {
        contents: [{
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            system: {
              conversations_count: conversations.length,
              conversations: conversations
            },
            status: 'healthy',
            features: {
              short_term_memory: true,
              long_term_memory: true,
              chinese_nlp: true,
              multimodal: true
            }
          }, null, 2)
        }]
      };
    }

    // Conversations list
    if (uri === 'memory://conversations/list') {
      const conversations = await listConversations();

      const details = await Promise.all(
        conversations.map(async (convId) => {
          try {
            const stManager = await getShortTermManager(convId);
            const ltManager = await getLongTermManager(convId);
            const stStats = stManager.getStats();
            const ltStats = ltManager.getStats();

            return {
              conversation_id: convId,
              short_term: {
                total: stStats.total,
                avg_score: stStats.avgScore?.toFixed(2) || 0
              },
              long_term: {
                total: ltStats.total,
                updated_count: ltStats.updatedCount
              }
            };
          } catch (error) {
            return {
              conversation_id: convId,
              error: error.message
            };
          }
        })
      );

      return {
        contents: [{
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            conversations: details,
            total: conversations.length
          }, null, 2)
        }]
      };
    }

    // Conversation-specific statistics
    const conversationMatch = uri.match(/^memory:\/\/stats\/conversation\/(.+)$/);
    if (conversationMatch) {
      const conversationId = conversationMatch[1];

      try {
        const stManager = await getShortTermManager(conversationId);
        const ltManager = await getLongTermManager(conversationId);
        const stStats = stManager.getStats();
        const ltStats = ltManager.getStats();

        return {
          contents: [{
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              conversation_id: conversationId,
              short_term: {
                total: stStats.total,
                avg_score: stStats.avgScore,
                max_score: stStats.maxScore,
                min_score: stStats.minScore,
                oldest_memory: stStats.oldestMemory ? new Date(stStats.oldestMemory).toISOString() : null,
                newest_memory: stStats.newestMemory ? new Date(stStats.newestMemory).toISOString() : null,
                last_cleanup: new Date(stStats.lastCleanup).toISOString(),
                conversation_counts: stStats.conversationCounts
              },
              long_term: {
                total: ltStats.total,
                updated_count: ltStats.updatedCount,
                oldest_creation: ltStats.oldestCreation ? new Date(ltStats.oldestCreation).toISOString() : null,
                newest_creation: ltStats.newestCreation ? new Date(ltStats.newestCreation).toISOString() : null,
                oldest_update: ltStats.oldestUpdate ? new Date(ltStats.oldestUpdate).toISOString() : null,
                newest_update: ltStats.newestUpdate ? new Date(ltStats.newestUpdate).toISOString() : null
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get stats for conversation ${conversationId}: ${error.message}`);
      }
    }

    // Best practices guide
    if (uri === 'memory://guide/best-practices') {
      const guide = `# Memory System Best Practices

## Short-term Memory

### When to Use
- Store recent conversation context
- Track temporary user preferences
- Keep track of current task state
- Remember facts mentioned in the current session

### Best Practices
1. **Be Selective**: Don't store every message, focus on important information
2. **Use Role Weights**: Increase weight for user messages (e.g., user: 2.7, assistant: 2.0)
3. **Include Context**: Store enough context for the memory to be useful later
4. **Regular Cleanup**: The system auto-cleans, but you can trigger manual cleanup if needed

### Example
\`\`\`json
{
  "messages": [
    {"role": "user", "content": "My favorite color is blue"},
    {"role": "assistant", "content": "I'll remember that!"}
  ],
  "conversation_id": "user_123",
  "roleWeights": {
    "user": 2.7,
    "assistant": 2.0
  }
}
\`\`\`

## Long-term Memory

### When to Use
- Store permanent facts (birthdays, preferences, etc.)
- Create conditional reminders
- Save important knowledge that should persist
- Set up context-sensitive information

### Trigger Condition Examples

**Simple keyword trigger:**
\`\`\`javascript
match_keys(context.messages, ['birthday', '生日'], 'any')
\`\`\`

**Multiple keywords (AND logic):**
\`\`\`javascript
match_keys_all(context.messages, ['project', 'deadline'], 'user')
\`\`\`

**Date-based trigger:**
\`\`\`javascript
(new Date().getMonth() === 6 && new Date().getDate() === 17) ||
match_keys(context.messages, ['birthday'], 'any')
\`\`\`

**Complex condition:**
\`\`\`javascript
match_keys(context.messages, ['vacation', 'holiday'], 'any') &&
(new Date().getMonth() >= 5 && new Date().getMonth() <= 7)
\`\`\`

### Best Practices
1. **Clear Names**: Use descriptive memory names
2. **Specific Triggers**: Make triggers as specific as needed
3. **Test Triggers**: Invalid triggers will be rejected
4. **Add Context**: Include createdContext to remember why the memory was created
5. **Update When Needed**: Use update_long_term_memory to keep information current

## Multimodal Support

The memory system supports attachments/modalities:
- Images with features/embeddings
- Audio with transcripts
- Video with metadata
- Any custom feature vectors

### Example with Modalities
\`\`\`json
{
  "messages": [...],
  "conversation_id": "user_123",
  "modalities": [
    {
      "type": "image",
      "uri": "https://example.com/image.jpg",
      "features": {
        "embedding": [0.1, 0.2, ...],
        "tags": ["cat", "outdoor"]
      }
    }
  ]
}
\`\`\`

## Search Strategy

### Short-term Search
Returns three categories:
- **Top Relevant** (max 2): Highest relevance scores
- **Next Relevant** (max 1): Next tier of relevance
- **Random Flashback** (max 2): Serendipitous old memories

### Long-term Search
Returns two categories:
- **Activated**: Memories whose triggers matched
- **Random**: Random selection for context enrichment

## Performance Tips

1. **Batch Operations**: Multiple memories can be added in sequence
2. **Appropriate Conversation IDs**: Use consistent IDs for the same conversation
3. **Monitor Stats**: Use get_memory_stats to track system health
4. **Cleanup Regularly**: Manual cleanup can be triggered if needed
5. **Test Triggers**: Always test complex trigger conditions before creating memories

## Common Patterns

### User Preference Storage
\`\`\`javascript
// Short-term: Current preferences
add_short_term_memory({
  messages: [{"role": "user", "content": "I prefer dark mode"}],
  conversation_id: "user_123"
})

// Long-term: Permanent preferences
add_long_term_memory({
  name: "ui_preference_dark_mode",
  prompt: "User prefers dark mode interface",
  trigger: "match_keys(context.messages, ['theme', 'dark', 'mode'], 'any')",
  conversation_id: "user_123"
})
\`\`\`

### Important Dates
\`\`\`javascript
add_long_term_memory({
  name: "anniversary_2024",
  prompt: "Wedding anniversary on July 17, 2024",
  trigger: "(new Date().getMonth() === 6 && new Date().getDate() === 17) || match_keys(context.messages, ['anniversary'], 'any')",
  conversation_id: "user_123"
})
\`\`\`

### Project Context
\`\`\`javascript
add_long_term_memory({
  name: "project_x_context",
  prompt: "Project X: AI-powered chatbot, deadline Dec 31, tech stack: Node.js + React",
  trigger: "match_keys(context.messages, ['project', 'Project X'], 'any')",
  conversation_id: "team_chat"
})
\`\`\`
`;

      return {
        contents: [{
          uri: uri,
          mimeType: 'text/markdown',
          text: guide
        }]
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  return {
    resources,
    readResource
  };
}

export default createResources;
