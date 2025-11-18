/**
 * MCP Prompts
 * 提供預定義的提示模板，幫助 AI 更好地使用記憶系統
 */

/**
 * 創建提示處理器
 */
export function createPrompts() {
  const prompts = [
    {
      name: 'remember-user-info',
      description: 'Store important user information in long-term memory',
      arguments: [
        {
          name: 'info_type',
          description: 'Type of information (e.g., preference, birthday, fact)',
          required: true
        },
        {
          name: 'information',
          description: 'The information to remember',
          required: true
        },
        {
          name: 'conversation_id',
          description: 'Conversation ID to store this memory under',
          required: false
        }
      ]
    },
    {
      name: 'recall-context',
      description: 'Search for relevant memories based on current conversation',
      arguments: [
        {
          name: 'current_topic',
          description: 'Current topic or question being discussed',
          required: true
        },
        {
          name: 'conversation_id',
          description: 'Conversation ID to search within',
          required: false
        }
      ]
    },
    {
      name: 'create-reminder',
      description: 'Create a conditional reminder that activates based on context or date',
      arguments: [
        {
          name: 'reminder_content',
          description: 'What to remind about',
          required: true
        },
        {
          name: 'trigger_condition',
          description: 'When to trigger (keywords or date)',
          required: true
        },
        {
          name: 'conversation_id',
          description: 'Conversation ID for this reminder',
          required: false
        }
      ]
    },
    {
      name: 'analyze-conversation',
      description: 'Analyze conversation history and create appropriate memories',
      arguments: [
        {
          name: 'conversation_id',
          description: 'Conversation ID to analyze',
          required: true
        }
      ]
    }
  ];

  /**
   * 處理提示獲取請求
   */
  async function getPrompt(name, args) {
    if (name === 'remember-user-info') {
      const { info_type, information, conversation_id = 'default' } = args || {};

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please store the following ${info_type || 'information'} in long-term memory: ${information || '[information not provided]'}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll help you store this information in long-term memory. Let me create a memory entry for this ${info_type || 'information'}.

To properly store "${information || '[information]'}", I'll:

1. Create a descriptive name for the memory
2. Set up an appropriate trigger condition that will activate when relevant
3. Store it under conversation_id: "${conversation_id}"

Here's my approach:

**Memory Name**: ${info_type ? `${info_type.toLowerCase().replace(/\s+/g, '_')}_` : ''}${Date.now()}

**Trigger Condition**: I'll use keywords from the information to create a trigger that activates when relevant topics are mentioned.

**Recommended Trigger**:
\`\`\`javascript
match_keys(context.messages, [${information ? information.split(' ').slice(0, 3).map(w => `'${w}'`).join(', ') : "'keyword'"}], 'any')
\`\`\`

Now I'll use the add_long_term_memory tool to store this.`
            }
          }
        ]
      };
    }

    if (name === 'recall-context') {
      const { current_topic, conversation_id = 'default' } = args || {};

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Search for relevant memories about: ${current_topic || '[topic not provided]'}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll search for relevant memories about "${current_topic || '[topic]'}".

I'll use both short-term and long-term memory searches:

**Short-term Memory Search**:
- Search recent conversation context
- Look for related discussions
- Find similar topics mentioned before

**Long-term Memory Search**:
- Check for permanent facts and preferences
- Evaluate trigger conditions
- Include random memories for serendipity

Using conversation_id: "${conversation_id}"

Let me search now using:
1. search_short_term_memories - for recent context
2. search_long_term_memories - for permanent facts

The search will consider:
- Keyword relevance
- Time decay (recent memories are weighted higher)
- Accumulated memory scores
- Trigger condition matching`
            }
          }
        ]
      };
    }

    if (name === 'create-reminder') {
      const { reminder_content, trigger_condition, conversation_id = 'default' } = args || {};

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Create a reminder: ${reminder_content || '[content not provided]'} that triggers when: ${trigger_condition || '[condition not provided]'}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll create a conditional reminder for: "${reminder_content || '[content]'}"

**Trigger Condition**: ${trigger_condition || '[condition]'}

Let me convert this into a proper JavaScript trigger condition:

${trigger_condition && trigger_condition.toLowerCase().includes('date') ? `
**Date-based Trigger Example**:
\`\`\`javascript
// Triggers on a specific date or when mentioned
(new Date().getMonth() === 6 && new Date().getDate() === 17) ||
match_keys(context.messages, ['reminder', 'important'], 'any')
\`\`\`
` : `
**Keyword-based Trigger Example**:
\`\`\`javascript
// Triggers when specific keywords are mentioned
match_keys(context.messages, [${trigger_condition ? trigger_condition.split(' ').slice(0, 3).map(w => `'${w}'`).join(', ') : "'keyword'"}], 'any')
\`\`\`
`}

**Memory Details**:
- Name: reminder_${Date.now()}
- Prompt: ${reminder_content || '[content]'}
- Conversation ID: ${conversation_id}

I'll now use add_long_term_memory to create this reminder.`
            }
          }
        ]
      };
    }

    if (name === 'analyze-conversation') {
      const { conversation_id = 'default' } = args || {};

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyze conversation ${conversation_id} and suggest what should be remembered`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll analyze conversation "${conversation_id}" and identify what should be remembered.

**Analysis Steps**:

1. **Get Current Statistics**
   - Use get_memory_stats to see what's already stored
   - Check both short-term and long-term memory counts
   - Review memory scores and relevance

2. **Identify Important Information**
   - User preferences and personal information
   - Important facts and decisions
   - Recurring topics and themes
   - Action items and reminders

3. **Categorize for Storage**

   **Short-term Memory (temporary context)**:
   - Recent conversation flow
   - Current task context
   - Session-specific information

   **Long-term Memory (permanent facts)**:
   - Personal information (birthdays, preferences)
   - Important decisions
   - Persistent preferences
   - Scheduled reminders

4. **Create Memory Entries**
   - Use descriptive names
   - Set appropriate trigger conditions
   - Include context for future reference

Let me first get the current memory statistics for this conversation using get_memory_stats.`
            }
          }
        ]
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  }

  return {
    prompts,
    getPrompt
  };
}

export default createPrompts;
