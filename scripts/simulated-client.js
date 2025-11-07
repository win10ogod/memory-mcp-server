#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createServer } from '../src/index.js';

function parseToolResponse(response) {
  assert.ok(response, 'Tool response should be defined');
  if (response.isError) {
    const message = response.content?.find(item => item.type === 'text')?.text || 'Unknown MCP error';
    throw new Error(`Tool invocation failed: ${message}`);
  }

  const textItem = response.content?.find(item => item.type === 'text');
  assert.ok(textItem, 'Tool response must include text content');

  return JSON.parse(textItem.text);
}

async function cleanupConversationData(conversationId) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  const sanitizedId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = path.join(dataDir, sanitizedId);

  await fs.rm(targetDir, { recursive: true, force: true });
}

async function main() {
  const server = await createServer();
  const listHandler = server._requestHandlers.get('tools/list');
  const callHandler = server._requestHandlers.get('tools/call');

  assert.ok(typeof listHandler === 'function', 'tools/list handler should be registered');
  assert.ok(typeof callHandler === 'function', 'tools/call handler should be registered');

  const listResponse = await listHandler({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  });

  assert.ok(Array.isArray(listResponse.tools), 'tools/list should return an array');
  assert.ok(listResponse.tools.length >= 1, 'tools/list should return registered tools');

  const addToolSchema = listResponse.tools.find(tool => tool.name === 'add_long_term_memory');
  assert.ok(addToolSchema, 'add_long_term_memory should be registered');
  assert.equal(addToolSchema.inputSchema.type, 'object');
  assert.ok(addToolSchema.inputSchema.properties?.conversation_id, 'add_long_term_memory schema should expose conversation_id');

  const listToolSchema = listResponse.tools.find(tool => tool.name === 'list_long_term_memories');
  assert.ok(listToolSchema?.inputSchema?.properties?.conversation_id, 'list_long_term_memories schema should expose conversation_id');

  const conversationId = 'sim-client-e2e';
  const memoryName = `simulated-memory-${Date.now()}`;

  const addResult = await callHandler({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'add_long_term_memory',
      arguments: {
        conversation_id: conversationId,
        name: memoryName,
        prompt: 'Memory created during simulated MCP client test.',
        trigger: 'true',
        createdContext: 'Simulated MCP client run'
      }
    }
  });

  const addParsed = parseToolResponse(addResult);
  assert.equal(addParsed.success, true, 'Long-term memory should be added successfully');

  const scopedList = await callHandler({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'list_long_term_memories',
      arguments: {
        conversation_id: conversationId
      }
    }
  });

  const scopedListParsed = parseToolResponse(scopedList);
  assert.ok(Array.isArray(scopedListParsed.memories), 'list_long_term_memories should return an array');
  assert.ok(
    scopedListParsed.memories.some(mem => mem.name === memoryName),
    'Newly added memory should exist in scoped conversation'
  );

  const defaultList = await callHandler({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'list_long_term_memories',
      arguments: {}
    }
  });

  const defaultListParsed = parseToolResponse(defaultList);
  const existsInDefault = (defaultListParsed.memories || []).some(mem => mem.name === memoryName);
  assert.equal(existsInDefault, false, 'Scoped memory should not leak into default conversation');

  const contextResult = await callHandler({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'get_memory_context',
      arguments: {
        conversation_id: conversationId,
        name: memoryName
      }
    }
  });

  const contextParsed = parseToolResponse(contextResult);
  assert.equal(contextParsed.success, true, 'get_memory_context should succeed for scoped memory');
  assert.equal(contextParsed.name, memoryName, 'Context response should match memory name');

  await cleanupConversationData(conversationId);

  console.log('✅ Simulated MCP client test completed successfully');
  process.exit(0);
}

main().catch(async (error) => {
  console.error('❌ Simulated MCP client test failed:', error);
  await cleanupConversationData('sim-client-e2e');
  process.exit(1);
});
