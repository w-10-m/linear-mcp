# linear-mcp

[![npm version](https://img.shields.io/npm/v/@west10tech/linear-mcp.svg)](https://www.npmjs.com/package/@west10tech/linear-mcp)

MCP server with Linear integration

**npm:** https://www.npmjs.com/package/@west10tech/linear-mcp

This MCP server includes the following integrations:

## Available Tools

This MCP server provides 23 tools across 1 integrations:

### Linear Tools
- **linear_create_issue**: Create a new issue with title, description, and team assignment
- **linear_get_issue**: Retrieve issue details by ID or identifier
- **linear_update_issue**: Update issue properties including title, description, priority, and state
- **linear_delete_issue**: Delete an issue by ID
- **linear_list_issues**: List issues with optional filtering by team, state, assignee, and labels
- **linear_list_teams**: List all teams in the workspace using simplified query structure. Removed problematic fields (timezone, private, archivedAt, members) to resolve 400 Bad Request errors. Returns core team identification data (id, name, key).
- **linear_get_team**: Get team details including members and settings
- **linear_list_users**: List all users in the workspace
- **linear_get_user**: Get user details and profile information
- **linear_assign_issue**: Assign a user to an issue
- **linear_create_project**: Create a new project
- **linear_get_project**: Get project details including associated issues
- **linear_list_projects**: List all projects with optional filtering
- **linear_update_project**: Update project properties
- **linear_list_workflow_states**: List all workflow states available in the workspace
- **linear_transition_issue**: Transition an issue to a different workflow state
- **linear_create_label**: Create a new label for issue categorization
- **linear_list_labels**: List all labels available in the workspace
- **linear_apply_labels**: Apply labels to an issue
- **linear_search_issues**: Search issues using filters (replaces deprecated issueSearch endpoint). Migrated from deprecated &#x27;issueSearch&#x27; to current &#x27;issues&#x27; endpoint with filtering. Use filter objects instead of text queries for more flexible and powerful search capabilities.
- **linear_get_viewer**: Get current user information (viewer)
- **linear_create_comment**: Create a comment on an issue
- **linear_list_comments**: List comments for an issue

## Installation

```bash
npm install @west10tech/linear-mcp
```

## Environment Setup

Create a `.env` file with the following variables:

```env
LINEAR_API_KEY=your_linear_api_key_here
```

## Usage

### Running the server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Using with Claude Desktop

Add this to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "linear-mcp": {
      "command": "npx",
      "args": ["@west10tech/linear-mcp"],
      "env": {
        "LINEAR_API_KEY": "your_linear_api_key_here"
      }
    }
  }
}
```

## Instructions for Fetching API Keys/Tokens
- **COMING SOON**

## Advanced Features

### Request Cancellation

This MCP server supports request cancellation according to the [MCP cancellation specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation). Clients can cancel in-progress requests by sending a `notifications/cancelled` message with the request ID.

When a request is cancelled:
- The server immediately stops processing the request
- Any ongoing API calls are aborted
- Resources are cleaned up
- No response is sent for the cancelled request

### Progress Notifications

The server supports progress notifications for long-running operations according to the [MCP progress specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress). 

To receive progress updates:
1. Include a `progressToken` in your request metadata
2. The server will send `notifications/progress` messages with:
   - Current progress value
   - Total value (when known)
   - Human-readable status messages

Progress is reported for:
- Multi-step operations
- Batch processing
- Long-running API calls
- File uploads/downloads

Example progress notification:
```json
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "operation-123",
    "progress": 45,
    "total": 100,
    "message": "Processing item 45 of 100..."
  }
}
```

