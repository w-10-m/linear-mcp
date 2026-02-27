import { LinearClient } from '../clients/linear-client.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../services/logger.js';
import { RequestContext } from '../services/request-tracker.js';
import { ProgressReporter } from '../services/progress-reporter.js';

export interface LinearToolsConfig {
  lINEARAPIKEY?: string;
  api_version?: any;
  authToken?: string;
  logger?: Logger;
}

export class LinearTools {
  private client: LinearClient;
  private initialized = false;
  private logger: Logger;

  constructor(client: LinearClient) {
    this.client = client;
    
    // Get logger from client if available, otherwise create fallback
    this.logger = (client as any).logger || new Logger(
      {
        logLevel: 'ERROR',
        component: 'tools',
        enableConsole: true,
        enableShipping: false,
        serverName: ''
      }
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      // Log tools initialization now that client is ready
      this.logger.info('TOOLS_INIT', 'Tools instance initialization started', { 
        integration: 'linear',
        isOAuth: false
      });
      
      this.logger.info('CLIENT_INITIALIZATION', 'Starting client initialization', {
        isOAuth: false
      });
      
      
      this.initialized = true;
      this.logger.info('CLIENT_INITIALIZATION', 'Client initialization completed', {
        initialized: this.initialized
      });
    }
  }

  getToolDefinitions(): Tool[] {
    return [
      {
        name: 'linear_create_issue',
        description: 'Create a new issue with title, description, and team assignment',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to create an issue'
            },
            variables: {
              type: 'object',
              description: 'Variables for the mutation including title, description, teamId, priority, assigneeId'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_get_issue',
        description: 'Retrieve issue details by ID or identifier',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to get issue details'
            },
            variables: {
              type: 'object',
              description: 'Variables containing the issue ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_update_issue',
        description: 'Update issue properties including title, description, priority, and state',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to update an issue'
            },
            variables: {
              type: 'object',
              description: 'Variables containing issue ID and update input'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_delete_issue',
        description: 'Delete an issue by ID',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to delete an issue'
            },
            variables: {
              type: 'object',
              description: 'Variables containing the issue ID to delete'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_issues',
        description: 'List issues with optional filtering by team, state, assignee, and labels',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list issues'
            },
            variables: {
              type: 'object',
              description: 'Variables for filtering and pagination'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_list_teams',
        description: 'List all teams in the workspace using simplified query structure. Removed problematic fields (timezone, private, archivedAt, members) to resolve 400 Bad Request errors. Returns core team identification data (id, name, key).',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list teams'
            },
            variables: {
              type: 'object',
              description: 'No variables needed for the basic query'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_get_team',
        description: 'Get team details including members and settings',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to get team details'
            },
            variables: {
              type: 'object',
              description: 'Variables containing the team ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_users',
        description: 'List all users in the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list users'
            },
            variables: {
              type: 'object',
              description: 'Variables for pagination'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_get_user',
        description: 'Get user details and profile information',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to get user details'
            },
            variables: {
              type: 'object',
              description: 'Variables containing the user ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_assign_issue',
        description: 'Assign a user to an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to assign user to issue'
            },
            variables: {
              type: 'object',
              description: 'Variables containing issue ID and assignee ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_create_project',
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to create a project'
            },
            variables: {
              type: 'object',
              description: 'Variables for project creation including name, description, and team IDs'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_get_project',
        description: 'Get project details including associated issues',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to get project details'
            },
            variables: {
              type: 'object',
              description: 'Variables containing the project ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_projects',
        description: 'List all projects with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list projects'
            },
            variables: {
              type: 'object',
              description: 'Variables for filtering and pagination'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_update_project',
        description: 'Update project properties',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to update a project'
            },
            variables: {
              type: 'object',
              description: 'Variables containing project ID and update input'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_workflow_states',
        description: 'List all workflow states available in the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list workflow states'
            },
            variables: {
              type: 'object',
              description: 'Variables for pagination'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_transition_issue',
        description: 'Transition an issue to a different workflow state',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to transition issue state'
            },
            variables: {
              type: 'object',
              description: 'Variables containing issue ID and target state ID'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_create_label',
        description: 'Create a new label for issue categorization',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to create a label'
            },
            variables: {
              type: 'object',
              description: 'Variables for label creation including name, color, and description'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_labels',
        description: 'List all labels available in the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list labels'
            },
            variables: {
              type: 'object',
              description: 'Variables for pagination'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_apply_labels',
        description: 'Apply labels to an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to apply labels to issue'
            },
            variables: {
              type: 'object',
              description: 'Variables containing issue ID and array of label IDs'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_search_issues',
        description: 'Search issues using filters (replaces deprecated issueSearch endpoint). Migrated from deprecated &#x27;issueSearch&#x27; to current &#x27;issues&#x27; endpoint with filtering. Use filter objects instead of text queries for more flexible and powerful search capabilities.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to search issues'
            },
            variables: {
              type: 'object',
              description: 'Variables for filtering issues. Supports filter.identifier shorthand (e.g., {"filter": {"identifier": {"eq": "W10-82"}}}) which auto-translates to team + number filters. Also supports standard filter objects (e.g., {"filter": {"title": {"contains": "search term"}}})'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_get_viewer',
        description: 'Get current user information (viewer)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to get viewer information'
            },
            variables: {
              type: 'object',
              description: 'No variables needed for viewer query'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_create_comment',
        description: 'Create a comment on an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL mutation to create a comment'
            },
            variables: {
              type: 'object',
              description: 'Variables for comment creation. Must be structured as: {&quot;input&quot;: {&quot;issueId&quot;: &quot;string&quot;, &quot;body&quot;: &quot;string&quot;}}. The issueId and body should be nested inside the input object, not as separate parameters.'
            }
          },
          required: ['query','variables']
        }
      },
      {
        name: 'linear_list_comments',
        description: 'List comments for an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GraphQL query to list comments'
            },
            variables: {
              type: 'object',
              description: 'Variables for filtering and pagination'
            }
          },
          required: ['query']
        }
      },
      // Bulk operations
      {
        name: 'linear_bulk_create_issues',
        description: 'Create multiple issues in bulk (max 50). Each item is a {query, variables} pair executed sequentially with progress reporting.',
        inputSchema: {
          type: 'object',
          properties: {
            issues: {
              type: 'array',
              description: 'Array of {query, variables} objects for issue creation mutations (max 50)',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'GraphQL mutation' },
                  variables: { type: 'object', description: 'Mutation variables' }
                },
                required: ['query', 'variables']
              }
            }
          },
          required: ['issues']
        }
      },
      {
        name: 'linear_bulk_update_issues',
        description: 'Update multiple issues in bulk (max 50). Each item is a {query, variables} pair executed sequentially with progress reporting.',
        inputSchema: {
          type: 'object',
          properties: {
            issues: {
              type: 'array',
              description: 'Array of {query, variables} objects for issue update mutations (max 50)',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'GraphQL mutation' },
                  variables: { type: 'object', description: 'Mutation variables' }
                },
                required: ['query', 'variables']
              }
            }
          },
          required: ['issues']
        }
      },
      {
        name: 'linear_bulk_transition_issues',
        description: 'Transition multiple issues to different workflow states in bulk (max 50). Each item is a {query, variables} pair executed sequentially with progress reporting.',
        inputSchema: {
          type: 'object',
          properties: {
            issues: {
              type: 'array',
              description: 'Array of {query, variables} objects for issue transition mutations (max 50)',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'GraphQL mutation' },
                  variables: { type: 'object', description: 'Mutation variables' }
                },
                required: ['query', 'variables']
              }
            }
          },
          required: ['issues']
        }
      },
      // Cycle/Sprint management
      {
        name: 'linear_list_cycles',
        description: 'List cycles (sprints) with optional team filtering',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL query to list cycles' },
            variables: { type: 'object', description: 'Variables for filtering by team and pagination' }
          },
          required: ['query']
        }
      },
      {
        name: 'linear_get_cycle',
        description: 'Get cycle details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL query to get cycle details' },
            variables: { type: 'object', description: 'Variables containing the cycle ID' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_create_cycle',
        description: 'Create a new cycle with team, start date, and end date',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to create a cycle' },
            variables: { type: 'object', description: 'Variables including teamId, startsAt, endsAt, name, description' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_update_cycle',
        description: 'Update cycle properties',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to update a cycle' },
            variables: { type: 'object', description: 'Variables containing cycle ID and update input' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_add_issue_to_cycle',
        description: 'Add an issue to a cycle by updating the issue with a cycleId',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to update issue with cycleId' },
            variables: { type: 'object', description: 'Variables containing issue ID and cycleId' }
          },
          required: ['query', 'variables']
        }
      },
      // Parent-child issue hierarchy
      {
        name: 'linear_create_sub_issue',
        description: 'Create a sub-issue (child issue) under a parent issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to create issue with parentId' },
            variables: { type: 'object', description: 'Variables including parentId, title, teamId' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_list_sub_issues',
        description: 'List child issues of a parent issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL query to list issue children' },
            variables: { type: 'object', description: 'Variables containing the parent issue ID' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_set_parent',
        description: 'Set the parent of an issue to create a hierarchy relationship',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to update issue with parentId' },
            variables: { type: 'object', description: 'Variables containing issue ID and parentId' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_remove_parent',
        description: 'Remove the parent from an issue (set parentId to null)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to update issue with parentId: null' },
            variables: { type: 'object', description: 'Variables containing the issue ID' }
          },
          required: ['query', 'variables']
        }
      },
      // Time tracking
      {
        name: 'linear_log_time',
        description: 'Log time or set estimate on an issue (story points or time-based depending on team settings)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to update issue estimate' },
            variables: { type: 'object', description: 'Variables containing issue ID and estimate value' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_get_time_entries',
        description: 'Get time tracking and estimate information for an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL query to get issue estimate and time fields' },
            variables: { type: 'object', description: 'Variables containing the issue ID' }
          },
          required: ['query', 'variables']
        }
      },
      // Attachments
      {
        name: 'linear_list_attachments',
        description: 'List attachments on an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL query to list issue attachments' },
            variables: { type: 'object', description: 'Variables containing the issue ID' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_create_attachment',
        description: 'Create a URL-based attachment on an issue',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to create attachment' },
            variables: { type: 'object', description: 'Variables including issueId, title, url' }
          },
          required: ['query', 'variables']
        }
      },
      {
        name: 'linear_delete_attachment',
        description: 'Delete an attachment by ID',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'GraphQL mutation to delete attachment' },
            variables: { type: 'object', description: 'Variables containing the attachment ID' }
          },
          required: ['query', 'variables']
        }
      }
    ];
  }

  canHandle(toolName: string): boolean {
    const supportedTools: string[] = [
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
    return supportedTools.includes(toolName);
  }

  async executeTool(name: string, args: any, context?: RequestContext, progressReporter?: ProgressReporter): Promise<any> {
    const startTime = Date.now();
    
    this.logger.logToolStart(name, args);
    
    // Check for early cancellation
    if (context?.abortController.signal.aborted) {
      this.logger.info('TOOL_CANCELLED_EARLY', 'Tool execution cancelled before start', {
        tool: name,
        requestId: context.requestId
      });
      throw new Error('Request was cancelled');
    }
    
    await this.ensureInitialized();
    
    // Validate tool is supported
    if (!this.canHandle(name)) {
      this.logger.error('TOOL_ERROR', 'Unknown tool requested', {
        tool: name,
        supportedTools: this.getToolDefinitions().map(t => t.name)
      });
      throw new Error(`Unknown tool: ${name}`);
    }
    
    // Validate required parameters
    this.logger.debug('PARAM_VALIDATION', 'Validating tool parameters', {
      tool: name,
      providedArgs: Object.keys(args || {})
    });
    
    try {
      let result;
      
      // Create request options with cancellation and progress support
      const requestOptions = {
        signal: context?.abortController.signal,
        onProgress: context?.progressToken && progressReporter ? 
          progressReporter.createProgressCallback(context.progressToken) : 
          undefined
      };
      
      switch (name) {
        case 'linear_create_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_create_issue',
            clientMethod: 'createIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting create_issue operation...`
            });
          }
          
          result = await this.client.createIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed create_issue operation`
            });
          }
          break;
        case 'linear_get_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_get_issue',
            clientMethod: 'getIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting get_issue operation...`
            });
          }
          
          result = await this.client.getIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed get_issue operation`
            });
          }
          break;
        case 'linear_update_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_update_issue',
            clientMethod: 'updateIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting update_issue operation...`
            });
          }
          
          result = await this.client.updateIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed update_issue operation`
            });
          }
          break;
        case 'linear_delete_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_delete_issue',
            clientMethod: 'deleteIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting delete_issue operation...`
            });
          }
          
          result = await this.client.deleteIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed delete_issue operation`
            });
          }
          break;
        case 'linear_list_issues':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_issues',
            clientMethod: 'listIssues',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_issues operation...`
            });
          }
          
          result = await this.client.listIssues(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_issues operation`
            });
          }
          break;
        case 'linear_list_teams':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_teams',
            clientMethod: 'listTeams',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_teams operation...`
            });
          }
          
          result = await this.client.listTeams(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_teams operation`
            });
          }
          break;
        case 'linear_get_team':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_get_team',
            clientMethod: 'getTeam',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting get_team operation...`
            });
          }
          
          result = await this.client.getTeam(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed get_team operation`
            });
          }
          break;
        case 'linear_list_users':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_users',
            clientMethod: 'listUsers',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_users operation...`
            });
          }
          
          result = await this.client.listUsers(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_users operation`
            });
          }
          break;
        case 'linear_get_user':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_get_user',
            clientMethod: 'getUser',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting get_user operation...`
            });
          }
          
          result = await this.client.getUser(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed get_user operation`
            });
          }
          break;
        case 'linear_assign_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_assign_issue',
            clientMethod: 'assignIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting assign_issue operation...`
            });
          }
          
          result = await this.client.assignIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed assign_issue operation`
            });
          }
          break;
        case 'linear_create_project':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_create_project',
            clientMethod: 'createProject',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting create_project operation...`
            });
          }
          
          result = await this.client.createProject(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed create_project operation`
            });
          }
          break;
        case 'linear_get_project':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_get_project',
            clientMethod: 'getProject',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting get_project operation...`
            });
          }
          
          result = await this.client.getProject(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed get_project operation`
            });
          }
          break;
        case 'linear_list_projects':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_projects',
            clientMethod: 'listProjects',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_projects operation...`
            });
          }
          
          result = await this.client.listProjects(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_projects operation`
            });
          }
          break;
        case 'linear_update_project':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_update_project',
            clientMethod: 'updateProject',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting update_project operation...`
            });
          }
          
          result = await this.client.updateProject(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed update_project operation`
            });
          }
          break;
        case 'linear_list_workflow_states':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_workflow_states',
            clientMethod: 'listWorkflowStates',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_workflow_states operation...`
            });
          }
          
          result = await this.client.listWorkflowStates(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_workflow_states operation`
            });
          }
          break;
        case 'linear_transition_issue':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_transition_issue',
            clientMethod: 'transitionIssue',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting transition_issue operation...`
            });
          }
          
          result = await this.client.transitionIssue(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed transition_issue operation`
            });
          }
          break;
        case 'linear_create_label':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_create_label',
            clientMethod: 'createLabel',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting create_label operation...`
            });
          }
          
          result = await this.client.createLabel(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed create_label operation`
            });
          }
          break;
        case 'linear_list_labels':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_labels',
            clientMethod: 'listLabels',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_labels operation...`
            });
          }
          
          result = await this.client.listLabels(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_labels operation`
            });
          }
          break;
        case 'linear_apply_labels':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_apply_labels',
            clientMethod: 'applyLabels',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting apply_labels operation...`
            });
          }
          
          result = await this.client.applyLabels(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed apply_labels operation`
            });
          }
          break;
        case 'linear_search_issues':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_search_issues',
            clientMethod: 'searchIssues',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting search_issues operation...`
            });
          }
          
          // Translate identifier filters to team.key + number filters
          const translatedArgs = {
            ...args,
            variables: translateIdentifierFilter(args.variables)
          };
          result = await this.client.searchIssues(translatedArgs, requestOptions);

          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed search_issues operation`
            });
          }
          break;
        case 'linear_get_viewer':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_get_viewer',
            clientMethod: 'getViewer',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting get_viewer operation...`
            });
          }
          
          result = await this.client.getViewer(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed get_viewer operation`
            });
          }
          break;
        case 'linear_create_comment':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_create_comment',
            clientMethod: 'createComment',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });
          
          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting create_comment operation...`
            });
          }
          
          result = await this.client.createComment(args, requestOptions);
          
          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed create_comment operation`
            });
          }
          break;
        case 'linear_list_comments':
          this.logger.debug('TOOL_EXECUTE', 'Calling client method', {
            tool: 'linear_list_comments',
            clientMethod: 'listComments',
            hasAbortSignal: !!requestOptions.signal,
            hasProgressCallback: !!requestOptions.onProgress
          });

          // Report initial progress
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 0,
              total: 100,
              message: `Starting list_comments operation...`
            });
          }

          result = await this.client.listComments(args, requestOptions);

          // Report completion
          if (context?.progressToken && progressReporter) {
            await progressReporter.report(context.progressToken, {
              progress: 100,
              total: 100,
              message: `Completed list_comments operation`
            });
          }
          break;
        case 'linear_bulk_create_issues':
          result = await this.client.bulkCreateIssues(args, requestOptions);
          break;
        case 'linear_bulk_update_issues':
          result = await this.client.bulkUpdateIssues(args, requestOptions);
          break;
        case 'linear_bulk_transition_issues':
          result = await this.client.bulkTransitionIssues(args, requestOptions);
          break;
        case 'linear_list_cycles':
          result = await this.client.listCycles(args, requestOptions);
          break;
        case 'linear_get_cycle':
          result = await this.client.getCycle(args, requestOptions);
          break;
        case 'linear_create_cycle':
          result = await this.client.createCycle(args, requestOptions);
          break;
        case 'linear_update_cycle':
          result = await this.client.updateCycle(args, requestOptions);
          break;
        case 'linear_add_issue_to_cycle':
          result = await this.client.addIssueToCycle(args, requestOptions);
          break;
        case 'linear_create_sub_issue':
          result = await this.client.createSubIssue(args, requestOptions);
          break;
        case 'linear_list_sub_issues':
          result = await this.client.listSubIssues(args, requestOptions);
          break;
        case 'linear_set_parent':
          result = await this.client.setParent(args, requestOptions);
          break;
        case 'linear_remove_parent':
          result = await this.client.removeParent(args, requestOptions);
          break;
        case 'linear_log_time':
          result = await this.client.logTime(args, requestOptions);
          break;
        case 'linear_get_time_entries':
          result = await this.client.getTimeEntries(args, requestOptions);
          break;
        case 'linear_list_attachments':
          result = await this.client.listAttachments(args, requestOptions);
          break;
        case 'linear_create_attachment':
          result = await this.client.createAttachment(args, requestOptions);
          break;
        case 'linear_delete_attachment':
          result = await this.client.deleteAttachment(args, requestOptions);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      const duration = Date.now() - startTime;
      this.logger.logToolSuccess(name, duration, result);

      // Return raw result for non-OAuth templates
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if error is due to cancellation
      const isCancelled = context?.abortController.signal.aborted || 
                         (error instanceof Error && error.message === 'Request was cancelled');
      
      if (isCancelled) {
        this.logger.info('TOOL_CANCELLED', 'Tool execution cancelled', {
          tool: name,
          duration_ms: duration,
          requestId: context?.requestId
        });
      } else {
        this.logger.logToolError(name, error, duration, args);
      }
      throw error;
    }
  }
}

/**
 * Parse a Linear issue identifier (e.g., "W10-82") into team key and number.
 */
export function parseIdentifier(id: string): { teamKey: string; number: number } {
  const match = id.match(/^([A-Z][A-Z0-9]*)-(\d+)$/);
  if (!match) throw new Error(`Invalid identifier format: "${id}". Expected format: "TEAM-123"`);
  return { teamKey: match[1]!, number: parseInt(match[2]!, 10) };
}

/**
 * Translate identifier filters (e.g., {filter: {identifier: {eq: "W10-82"}}})
 * into valid Linear GraphQL filters using team.key + number.
 */
export function translateIdentifierFilter(variables: any): any {
  const identifier = variables?.filter?.identifier;
  if (!identifier) return variables;

  const result = JSON.parse(JSON.stringify(variables));
  const { identifier: idFilter, ...restFilter } = result.filter;

  let teamFilter: any;
  let numberFilter: any;

  if (idFilter.eq) {
    const parsed = parseIdentifier(idFilter.eq);
    teamFilter = { key: { eq: parsed.teamKey } };
    numberFilter = { eq: parsed.number };
  } else if (idFilter.in) {
    const parsed = idFilter.in.map((id: string) => parseIdentifier(id));
    const teamKeys = [...new Set(parsed.map((p: { teamKey: string }) => p.teamKey))];
    teamFilter = teamKeys.length === 1
      ? { key: { eq: teamKeys[0] } }
      : { key: { in: teamKeys } };
    numberFilter = { in: parsed.map((p: { number: number }) => p.number) };
  }

  result.filter = {
    ...restFilter,
    ...(teamFilter && { team: teamFilter }),
    ...(numberFilter && { number: numberFilter }),
  };

  return result;
}