# linear-mcp

[![npm version](https://img.shields.io/npm/v/@west10tech/linear-mcp.svg)](https://www.npmjs.com/package/@west10tech/linear-mcp)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/gcaliene/c82f3d6c4e7745c3b46adb16d52c0384/raw/coverage.json)]()

MCP server for Linear issue tracking — 40 tools covering issues, projects, cycles, labels, comments, attachments, bulk operations, and more.

**npm:** https://www.npmjs.com/package/@west10tech/linear-mcp

## Installation

```bash
npm install @west10tech/linear-mcp
```

Or run directly with npx:

```bash
npx @west10tech/linear-mcp
```

## API Key Setup

1. Go to [Linear Settings → API](https://linear.app/settings/api)
2. Click **"Create key"** under Personal API Keys
3. Give it a label (e.g., "MCP Server") and click **Create**
4. Copy the key — it's only shown once
5. Set it as an environment variable:

```bash
export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxx
```

Or add it to a `.env` file in the project root:

```env
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxx
```

## Configuration

| Environment Variable | Required | Default | Description |
|---|---|---|---|
| `LINEAR_API_KEY` | Yes | — | Linear personal API key |
| `LOG_SHIPPING_ENABLED` | No | `false` | Enable centralized log shipping |
| `LOG_LEVEL` | No | `INFO` | Log level (DEBUG, INFO, WARN, ERROR) |
| `LOG_INGESTION_ENDPOINT` | No | — | HTTP endpoint for log shipping |
| `LOG_INGESTION_API_KEY` | No | — | API key for log ingestion endpoint |

## Available Tools (40)

All tools use the **GraphQL pass-through pattern**: you provide a `query` (GraphQL string) and `variables` (object), and the server executes it against the Linear API.

### Issue Management (6)

| Tool | Description |
|---|---|
| `linear_create_issue` | Create a new issue with title, description, and team assignment |
| `linear_get_issue` | Retrieve issue details by ID or identifier |
| `linear_update_issue` | Update issue properties (title, description, priority, state) |
| `linear_delete_issue` | Delete an issue by ID |
| `linear_list_issues` | List issues with optional filtering by team, state, assignee, labels |
| `linear_search_issues` | Search issues using filters with identifier translation (e.g., `W10-82` → team key + number) |

<details>
<summary>Example: Create an issue</summary>

```json
{
  "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }",
  "variables": {
    "input": {
      "title": "Fix login bug",
      "teamId": "team-uuid",
      "priority": 2
    }
  }
}
```
</details>

<details>
<summary>Example: Search by identifier</summary>

```json
{
  "query": "query SearchIssues($filter: IssueFilter) { issues(filter: $filter) { nodes { id identifier title state { name } } } }",
  "variables": {
    "filter": {
      "identifier": { "eq": "W10-82" }
    }
  }
}
```

The server automatically translates `identifier` filters into `team.key` + `number` filters.
</details>

### Bulk Operations (3)

| Tool | Description |
|---|---|
| `linear_bulk_create_issues` | Create up to 50 issues sequentially with per-item progress |
| `linear_bulk_update_issues` | Update up to 50 issues sequentially with per-item progress |
| `linear_bulk_transition_issues` | Transition up to 50 issues to different states with per-item progress |

<details>
<summary>Example: Bulk create issues</summary>

```json
{
  "issues": [
    {
      "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }",
      "variables": { "input": { "title": "Task 1", "teamId": "team-uuid" } }
    },
    {
      "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }",
      "variables": { "input": { "title": "Task 2", "teamId": "team-uuid" } }
    }
  ]
}
```

Returns `{ total, succeeded, failed, results }` summary.
</details>

### Team & User Management (5)

| Tool | Description |
|---|---|
| `linear_list_teams` | List all teams in the workspace |
| `linear_get_team` | Get team details including members and settings |
| `linear_list_users` | List all users in the workspace |
| `linear_get_user` | Get user details and profile information |
| `linear_get_viewer` | Get current authenticated user information |

### Issue Assignment & Workflow (3)

| Tool | Description |
|---|---|
| `linear_assign_issue` | Assign a user to an issue |
| `linear_list_workflow_states` | List all workflow states in the workspace |
| `linear_transition_issue` | Transition an issue to a different workflow state |

### Project Management (4)

| Tool | Description |
|---|---|
| `linear_create_project` | Create a new project |
| `linear_get_project` | Get project details including associated issues |
| `linear_list_projects` | List all projects with optional filtering |
| `linear_update_project` | Update project properties |

### Cycle/Sprint Management (5)

| Tool | Description |
|---|---|
| `linear_list_cycles` | List cycles (sprints) with optional team filtering |
| `linear_get_cycle` | Get cycle details by ID |
| `linear_create_cycle` | Create a new cycle with team, start date, and end date |
| `linear_update_cycle` | Update cycle properties |
| `linear_add_issue_to_cycle` | Add an issue to a cycle |

<details>
<summary>Example: Create a cycle</summary>

```json
{
  "query": "mutation($input: CycleCreateInput!) { cycleCreate(input: $input) { success cycle { id name startsAt endsAt } } }",
  "variables": {
    "input": {
      "teamId": "team-uuid",
      "name": "Sprint 14",
      "startsAt": "2026-03-03",
      "endsAt": "2026-03-17"
    }
  }
}
```
</details>

### Parent-Child Hierarchy (4)

| Tool | Description |
|---|---|
| `linear_create_sub_issue` | Create a sub-issue (child) under a parent issue |
| `linear_list_sub_issues` | List child issues of a parent issue |
| `linear_set_parent` | Set the parent of an issue |
| `linear_remove_parent` | Remove the parent from an issue |

<details>
<summary>Example: Create a sub-issue</summary>

```json
{
  "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier parent { identifier } } } }",
  "variables": {
    "input": {
      "title": "Sub-task",
      "teamId": "team-uuid",
      "parentId": "parent-issue-uuid"
    }
  }
}
```
</details>

### Labels (3)

| Tool | Description |
|---|---|
| `linear_create_label` | Create a new label for issue categorization |
| `linear_list_labels` | List all labels available in the workspace |
| `linear_apply_labels` | Apply labels to an issue |

### Comments (2)

| Tool | Description |
|---|---|
| `linear_create_comment` | Create a comment on an issue |
| `linear_list_comments` | List comments for an issue |

### Time Tracking (2)

| Tool | Description |
|---|---|
| `linear_log_time` | Log time or set estimate on an issue |
| `linear_get_time_entries` | Get time tracking and estimate information for an issue |

### Attachments (3)

| Tool | Description |
|---|---|
| `linear_list_attachments` | List attachments on an issue |
| `linear_create_attachment` | Create a URL-based attachment on an issue |
| `linear_delete_attachment` | Delete an attachment by ID |

## Architecture

```
src/
├── index.ts                    # MCP server entry point, request routing
├── config.ts                   # Environment variable parsing & validation
├── types.ts                    # Typed interfaces (GraphQLToolParams, ToolResponse, etc.)
├── clients/
│   └── linear-client.ts        # HTTP client for Linear GraphQL API
├── tools/
│   ├── linear-tools.ts         # Tool definitions, routing, execution
│   └── __tests__/
│       └── identifier-filter.test.ts
└── services/
    ├── logger.ts               # Structured JSON logging
    ├── log-batcher.ts          # Log batching for efficient shipping
    ├── log-shipper.ts          # HTTP log shipping to central endpoint
    ├── request-tracker.ts      # Request lifecycle & cancellation tracking
    ├── progress-reporter.ts    # MCP progress notifications
    └── __tests__/              # Service unit tests (86%+ coverage)
```

### GraphQL Pass-Through Pattern

All tools accept a `query` (GraphQL string) and `variables` (object), which are POSTed directly to `https://api.linear.app/graphql`. This means:

- Any valid Linear GraphQL query/mutation works
- No need to update the MCP server when Linear adds new fields
- Full flexibility for the calling AI to construct optimal queries
- The server handles auth, error handling, cancellation, and progress reporting

### Request Flow

1. Client sends `tools/call` with tool name and arguments
2. Server routes to `LinearTools.executeTool()` via `canHandle()` check
3. Tool delegates to `LinearClient` method
4. Client POSTs GraphQL to Linear API with auth headers
5. Response wrapped in MCP `ToolResponse` format and returned

## Advanced Features

### Identifier Translation

The `linear_search_issues` tool automatically translates human-readable identifiers (e.g., `W10-82`) into Linear's internal filter format (`team.key` + `number`). You can use:

```json
{ "filter": { "identifier": { "eq": "W10-82" } } }
```

or batch lookups:

```json
{ "filter": { "identifier": { "in": ["W10-82", "W10-83", "W10-84"] } } }
```

### Request Cancellation

Supports the [MCP cancellation spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation). Clients can cancel in-progress requests by sending `notifications/cancelled` with the request ID. Bulk operations check for cancellation between each item.

### Progress Notifications

Supports [MCP progress notifications](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress). Include a `progressToken` in request metadata to receive `notifications/progress` messages:

```json
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "op-123",
    "progress": 5,
    "total": 50,
    "message": "Creating issue 5 of 50..."
  }
}
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `401 Unauthorized` | Check `LINEAR_API_KEY` is set and valid. Regenerate at Linear Settings → API. |
| `400 Bad Request` | Your GraphQL query has a syntax error or requests unsupported fields. Test in Linear's API explorer first. |
| Tool not found | Verify the tool name matches exactly (e.g., `linear_create_issue`, not `create_issue`). |
| Timeout errors | Default timeout is 30s. For bulk operations with many items, this is per-item. |
| Rate limiting | Linear API has rate limits. Bulk operations execute sequentially to avoid hitting limits. |
| `Request was cancelled` | A cancellation notification was received. This is expected behavior. |

## Using with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "linear-mcp": {
      "command": "npx",
      "args": ["@west10tech/linear-mcp"],
      "env": {
        "LINEAR_API_KEY": "lin_api_xxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## Development

### Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Run with tsx (hot reload) |
| `npm start` | Run compiled output |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run E2E protocol tests |
| `npm run test:all` | Run unit + E2E tests |
| `npm run lint` | Run ESLint |

### Testing

Unit tests cover services (logging, batching, request tracking, progress) with 86%+ coverage. E2E tests spawn the actual MCP server process and validate:

- JSON-RPC protocol compliance
- All 40 tools are registered with valid schemas
- Error handling for unknown tools and missing parameters
- Cancellation and progress notification handling

```bash
npm test              # Unit tests
npm run test:e2e      # E2E protocol tests
npm test -- --coverage # Coverage report
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure `npm run build && npm test && npm run test:e2e` passes
5. Commit with [conventional commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`)
6. Open a pull request

Semantic-release handles versioning and publishing based on commit messages.

## License

MIT
