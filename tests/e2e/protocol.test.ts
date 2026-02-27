import { McpTestClient } from './helpers/mcp-client';

describe('JSON-RPC Protocol', () => {
  let client: McpTestClient;

  beforeEach(async () => {
    client = new McpTestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  describe('request/response', () => {
    it('returns tools/list with all tools', async () => {
      const tools = await client.listTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('returns error for unknown method', async () => {
      await expect(
        client.request('unknown/method')
      ).rejects.toThrow();
    });

    it('includes all expected Linear tools', async () => {
      const tools = await client.listTools();
      const toolNames = tools.map(t => t.name);

      // Verify core tools exist
      const expectedTools = [
        'linear_create_issue',
        'linear_get_issue',
        'linear_update_issue',
        'linear_delete_issue',
        'linear_list_issues',
        'linear_list_teams',
        'linear_get_team',
        'linear_list_users',
        'linear_get_user',
        'linear_assign_issue',
        'linear_create_project',
        'linear_get_project',
        'linear_list_projects',
        'linear_update_project',
        'linear_list_workflow_states',
        'linear_transition_issue',
        'linear_create_label',
        'linear_list_labels',
        'linear_apply_labels',
        'linear_search_issues',
        'linear_get_viewer',
        'linear_create_comment',
        'linear_list_comments',
        'linear_bulk_create_issues',
        'linear_bulk_update_issues',
        'linear_bulk_transition_issues',
        'linear_list_cycles',
        'linear_get_cycle',
        'linear_create_cycle',
        'linear_update_cycle',
        'linear_add_issue_to_cycle',
        'linear_create_sub_issue',
        'linear_list_sub_issues',
        'linear_set_parent',
        'linear_remove_parent',
        'linear_log_time',
        'linear_get_time_entries',
        'linear_list_attachments',
        'linear_create_attachment',
        'linear_delete_attachment'
      ];

      for (const tool of expectedTools) {
        expect(toolNames).toContain(tool);
      }
    });
  });

  describe('error handling', () => {
    it('returns error for missing required parameters', async () => {
      // linear_create_issue requires teamId and title
      await expect(
        client.callTool('linear_create_issue', {})
      ).rejects.toThrow();
    });

    it('returns error for non-existent tool', async () => {
      await expect(
        client.callTool('non_existent_tool', {})
      ).rejects.toThrow();
    });

    it('returns API error when credentials are invalid', async () => {
      // With test API key, real API calls will fail - this tests error handling
      await expect(
        client.callTool('linear_list_teams', {})
      ).rejects.toThrow();
    });
  });

  describe('notifications', () => {
    it('can send notifications', () => {
      // Notifications don't have responses, just verify no error
      expect(() => {
        client.sendNotification('notifications/initialized', {});
      }).not.toThrow();
    });

    it('can send cancellation notification', () => {
      expect(() => {
        client.sendCancellation('request-123', 'User cancelled');
      }).not.toThrow();
    });
  });

  describe('tool schema validation', () => {
    it('each tool has required schema properties', async () => {
      const tools = await client.listTools();

      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('linear_create_issue has a valid input schema', async () => {
      const tools = await client.listTools();
      const createIssueTool = tools.find(t => t.name === 'linear_create_issue');

      expect(createIssueTool).toBeDefined();
      expect(createIssueTool!.inputSchema).toBeDefined();
      expect(createIssueTool!.inputSchema.type).toBe('object');
      expect(createIssueTool!.inputSchema.properties).toBeDefined();
      expect(createIssueTool!.inputSchema.required).toBeDefined();
      expect(Array.isArray(createIssueTool!.inputSchema.required)).toBe(true);
    });
  });
});
