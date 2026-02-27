
export interface ServerConfig {
  name: string;
  version: string;
}

// Request tracking and cancellation types
export interface RequestContext {
  requestId: string;
  abortController: AbortController;
  progressToken?: string | number;
  startTime: number;
  toolName?: string;
}

// Progress notification types
export interface ProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

export interface ProgressCallback {
  (update: ProgressUpdate): Promise<void>;
}

// Extended client options with cancellation and progress support
export interface RequestOptions {
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  progressInterval?: number;
}

// GraphQL tool parameter types
export interface GraphQLToolParams {
  query: string;
  variables?: Record<string, unknown>;
}

// MCP tool response format
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

// Bulk operation types
export interface BulkOperationInput {
  issues: Array<GraphQLToolParams>;
}

export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ success: boolean; data?: unknown; error?: string }>;
}

// Specific parameter interfaces for documentation
export interface CreateIssueParams extends GraphQLToolParams {
  variables: {
    input: {
      title: string;
      teamId: string;
      description?: string;
      priority?: number;
      assigneeId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface UpdateIssueParams extends GraphQLToolParams {
  variables: {
    id: string;
    input: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface SingleIdParams extends GraphQLToolParams {
  variables: {
    id: string;
    [key: string]: unknown;
  };
}

export interface ListParams extends GraphQLToolParams {
  variables?: {
    filter?: Record<string, unknown>;
    first?: number;
    after?: string;
    [key: string]: unknown;
  };
}

export interface SearchIssuesParams extends GraphQLToolParams {
  variables: {
    filter: Record<string, unknown>;
    [key: string]: unknown;
  };
}