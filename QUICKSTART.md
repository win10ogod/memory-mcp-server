# Quick Start Guide

Get the Memory MCP Server running in 5 minutes.

## Installation

```bash
cd memory-mcp-server
npm install
```

## Test Locally

```bash
# Quick functionality test (doesn't require MCP client)
node test-basic.js
```

You should see output like:
```
🧪 Running basic functionality tests...

Test 1: Jieba Keyword Extraction
✓ Keywords extracted: 喜欢, 披萨, 咖啡

Test 2: Keyword Matching
✓ Keyword matches found: 1

...

✅ Basic functionality tests complete!
```

## Configure MCP Client

### For Claude Desktop

1. Find your config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this configuration (replace the path):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["C:/full/path/to/memory-mcp-server/src/index.js"]
    }
  }
}
```

3. Restart Claude Desktop

### For Cursor

1. Add to `.cursor/mcp_config.json`:

```json
{
  "memory": {
    "command": "node",
    "args": ["/full/path/to/memory-mcp-server/src/index.js"]
  }
}
```

2. Restart Cursor

## Try It Out

In your MCP client (Claude/Cursor), try:

### Short-term Memory
```
"Remember that I love pizza and coffee"
```

Then later:
```
"What foods do I like?"
```

### Long-term Memory
```
"Create a permanent memory: my birthday is July 17th. 
It should trigger when someone mentions 'birthday' or 'July'"
```

Then:
```
"When is my birthday?"
```

## Verify Installation

Check that tools are available in your MCP client:

**Short-term memory tools:**
- add_short_term_memory
- search_short_term_memories
- delete_short_term_memories
- get_memory_stats
- cleanup_memories
- get_frequent_conversation

**Long-term memory tools:**
- add_long_term_memory
- update_long_term_memory
- delete_long_term_memory
- list_long_term_memories
- search_long_term_memories
- get_memory_context

## Data Storage

Memories are stored in:
```
memory-mcp-server/data/{conversation_id}/
  ├── short-term-memory.json
  └── long-term-memory.json
```

Each conversation gets its own directory for isolated memory spaces.

## Troubleshooting

**"node: command not found"**
- Install Node.js 18+ from https://nodejs.org

**"Cannot find module '@modelcontextprotocol/sdk'"**
- Run `npm install` in the memory-mcp-server directory

**Tools don't appear in client**
- Check the absolute path in config is correct
- Restart your MCP client completely
- Check client logs for errors

**Chinese text not processing correctly**
- Ensure @node-rs/jieba installed: `npm list @node-rs/jieba`
- Check Node.js version is 18+

## Next Steps

- Read [README.md](./README.md) for complete documentation
- See [TESTING.md](./TESTING.md) for detailed testing procedures
- Check [example-config.json](./example-config.json) for configuration options

## Support

This is an extraction from the GentianAphrodite project. For issues:
1. Check the TESTING.md troubleshooting section
2. Verify all dependencies are installed
3. Test with test-basic.js first

