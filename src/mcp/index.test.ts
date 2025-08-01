import { describe, test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { randomUUID } from 'crypto';
import { McpServer } from './index.js';
import { Database } from '../db/index.js';
import type { AppConfig } from '../types/config.js';

// Helper type for text content
interface TextContent {
  type: 'text';
  text: string;
}

interface CallToolResult {
  content: [TextContent, ...TextContent[]]; // At least one element
}

// Helper function to assert and type-cast call tool results
function assertTextResult(result: unknown): CallToolResult {
  expect(result).toHaveProperty('content');

  const candidate = result as { content: unknown };
  expect(Array.isArray(candidate.content)).toBe(true);
  expect((candidate.content as unknown[]).length).toBeGreaterThan(0);

  const firstContent = (candidate.content as unknown[])[0];
  expect(firstContent).toHaveProperty('type', 'text');
  expect(firstContent).toHaveProperty('text');
  expect(typeof (firstContent as { text: unknown }).text).toBe('string');

  return result as CallToolResult;
}

async function setupMcpClient() {
  const testUserId = randomUUID();
  const testConfig: AppConfig = {
    databasePath: ':memory:',
    logLevel: 'error',
    serverTransport: 'stdio',
  };

  // Initialize in-memory database
  const database = new Database(testConfig);
  await database.initialize();

  // Create MCP server with test user
  const mcpServer = new McpServer(testUserId, database);

  // Set up in-memory transport pair for client-server communication
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Create client
  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  // Connect both client and server
  await Promise.all([client.connect(clientTransport), mcpServer.getServer().connect(serverTransport)]);

  return { client, database };
}

describe('McpServer', () => {
  test('should add a meal successfully', async () => {
    const { client, database } = await setupMcpClient();

    const result = await client.callTool({
      name: 'add_meals',
      arguments: {
        meals: [
          {
            mealName: 'Test Breakfast',
            calories: 350,
          },
        ],
      },
    });

    const typedResult = assertTextResult(result);
    expect(typedResult.content[0].text).toContain('Added meal: Test Breakfast');

    // Cleanup
    await client.close();
    await database.closeDatabase();
  });

  test('should calculate metabolic rate from meals and weights', async () => {
    const { client, database } = await setupMcpClient();

    // Add weights (2 extra days before + 7 days of data)
    await client.callTool({
      name: 'add_weights',
      arguments: {
        weights: [
          { weightKg: 75.2, loggedAt: '2024-01-01' }, // 2 days before start
          { weightKg: 75.1, loggedAt: '2024-01-02' }, // 1 day before start
          { weightKg: 75.0, loggedAt: '2024-01-03' }, // Start day
          { weightKg: 74.8, loggedAt: '2024-01-04' },
          { weightKg: 74.6, loggedAt: '2024-01-05' },
          { weightKg: 74.4, loggedAt: '2024-01-06' },
          { weightKg: 74.2, loggedAt: '2024-01-07' },
          { weightKg: 74.0, loggedAt: '2024-01-08' },
          { weightKg: 73.8, loggedAt: '2024-01-09' }, // End day
        ],
      },
    });

    // Add 7 days of meals (2000 calories per day)
    await client.callTool({
      name: 'add_meals',
      arguments: {
        meals: [
          { mealName: 'Day 1', calories: 2000, loggedAt: '2024-01-03T12:00:00Z' },
          { mealName: 'Day 2', calories: 2000, loggedAt: '2024-01-04T12:00:00Z' },
          { mealName: 'Day 3', calories: 2000, loggedAt: '2024-01-05T12:00:00Z' },
          { mealName: 'Day 4', calories: 2000, loggedAt: '2024-01-06T12:00:00Z' },
          { mealName: 'Day 5', calories: 2000, loggedAt: '2024-01-07T12:00:00Z' },
          { mealName: 'Day 6', calories: 2000, loggedAt: '2024-01-08T12:00:00Z' },
          { mealName: 'Day 7', calories: 2000, loggedAt: '2024-01-09T12:00:00Z' },
        ],
      },
    });

    // Calculate metabolic rate for 7-day period
    const result = await client.callTool({
      name: 'calculate_metabolic_rate',
      arguments: {
        startDate: '2024-01-03',
        updateSettings: false,
      },
    });

    const typedResult = assertTextResult(result);
    const responseText = typedResult.content[0].text;

    // Validate key strings in the response
    expect(responseText).toMatch(/Calculated Rate.*3210.*cal\/day/);
    expect(responseText).toContain('**Current Setting**: 2000 cal/day');
    expect(responseText).toContain('**Difference**: +1210 cal/day');
    expect(responseText).toContain('**Analysis Window**: 2024-01-03 to 2024-01-09');
    expect(responseText).toContain('**Average Daily Intake**: 2000 calories');
    expect(responseText).toContain('**Weight Change**: -1.1kg');
    expect(responseText).toContain('**Days with Data**: 7/7');

    // Cleanup
    await client.close();
    await database.closeDatabase();
  });
});
