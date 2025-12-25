import nock from 'nock';

/**
 * Linear API Mock Helper
 * Sets up nock interceptors for the Linear GraphQL API
 */

const LINEAR_API_URL = 'https://api.linear.app';

// Sample fixture data
export const fixtures = {
  viewer: {
    data: {
      viewer: {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com'
      }
    }
  },

  teams: {
    data: {
      teams: {
        nodes: [
          { id: 'team-1', name: 'Engineering', key: 'ENG' },
          { id: 'team-2', name: 'Product', key: 'PROD' }
        ]
      }
    }
  },

  issues: {
    data: {
      issues: {
        nodes: [
          {
            id: 'issue-1',
            identifier: 'ENG-1',
            title: 'Test Issue 1',
            description: 'Description 1',
            state: { name: 'In Progress' },
            priority: 2
          },
          {
            id: 'issue-2',
            identifier: 'ENG-2',
            title: 'Test Issue 2',
            description: 'Description 2',
            state: { name: 'Todo' },
            priority: 1
          }
        ]
      }
    }
  },

  issueCreate: {
    data: {
      issueCreate: {
        success: true,
        issue: {
          id: 'issue-new',
          identifier: 'ENG-3',
          title: 'New Issue',
          description: 'New Description'
        }
      }
    }
  },

  issueUpdate: {
    data: {
      issueUpdate: {
        success: true,
        issue: {
          id: 'issue-1',
          identifier: 'ENG-1',
          title: 'Updated Issue',
          description: 'Updated Description'
        }
      }
    }
  },

  issueDelete: {
    data: {
      issueDelete: {
        success: true
      }
    }
  },

  projects: {
    data: {
      projects: {
        nodes: [
          { id: 'proj-1', name: 'Project Alpha', description: 'Alpha project' },
          { id: 'proj-2', name: 'Project Beta', description: 'Beta project' }
        ]
      }
    }
  },

  labels: {
    data: {
      issueLabels: {
        nodes: [
          { id: 'label-1', name: 'bug', color: '#ff0000' },
          { id: 'label-2', name: 'feature', color: '#00ff00' }
        ]
      }
    }
  },

  workflowStates: {
    data: {
      workflowStates: {
        nodes: [
          { id: 'state-1', name: 'Backlog', type: 'backlog' },
          { id: 'state-2', name: 'Todo', type: 'unstarted' },
          { id: 'state-3', name: 'In Progress', type: 'started' },
          { id: 'state-4', name: 'Done', type: 'completed' }
        ]
      }
    }
  },

  error: {
    errors: [
      {
        message: 'Not found',
        extensions: { code: 'NOT_FOUND' }
      }
    ]
  },

  rateLimited: {
    errors: [
      {
        message: 'Rate limit exceeded',
        extensions: { code: 'RATE_LIMITED' }
      }
    ]
  }
};

/**
 * Set up Linear API mocks with intelligent query routing
 */
export function mockLinearApi(): nock.Scope {
  return nock(LINEAR_API_URL)
    .persist()
    .post('/graphql')
    .reply(200, (uri, body: any) => {
      const query = body.query || '';

      // Route based on query content
      if (query.includes('viewer')) {
        return fixtures.viewer;
      }
      if (query.includes('teams')) {
        return fixtures.teams;
      }
      if (query.includes('issueCreate')) {
        return fixtures.issueCreate;
      }
      if (query.includes('issueUpdate')) {
        return fixtures.issueUpdate;
      }
      if (query.includes('issueDelete')) {
        return fixtures.issueDelete;
      }
      if (query.includes('issues')) {
        return fixtures.issues;
      }
      if (query.includes('projects')) {
        return fixtures.projects;
      }
      if (query.includes('issueLabels')) {
        return fixtures.labels;
      }
      if (query.includes('workflowStates')) {
        return fixtures.workflowStates;
      }

      // Default response
      return { data: {} };
    });
}

/**
 * Set up mock that returns an error
 */
export function mockLinearApiError(errorCode: string = 'NOT_FOUND'): nock.Scope {
  return nock(LINEAR_API_URL)
    .persist()
    .post('/graphql')
    .reply(200, {
      errors: [
        {
          message: `Error: ${errorCode}`,
          extensions: { code: errorCode }
        }
      ]
    });
}

/**
 * Set up mock that simulates rate limiting
 */
export function mockLinearApiRateLimited(): nock.Scope {
  return nock(LINEAR_API_URL)
    .persist()
    .post('/graphql')
    .reply(429, fixtures.rateLimited);
}

/**
 * Set up mock that simulates network error
 */
export function mockLinearApiNetworkError(): nock.Scope {
  return nock(LINEAR_API_URL)
    .persist()
    .post('/graphql')
    .replyWithError('Network error');
}

/**
 * Set up mock for specific operation
 */
export function mockLinearOperation(
  operationName: string,
  response: any,
  statusCode: number = 200
): nock.Scope {
  return nock(LINEAR_API_URL)
    .post('/graphql', (body: any) => {
      return body.query?.includes(operationName);
    })
    .reply(statusCode, response);
}

/**
 * Clean up all nock mocks
 */
export function clearMocks(): void {
  nock.cleanAll();
}

/**
 * Disable real HTTP requests (should be called in test setup)
 */
export function disableNetRequests(): void {
  nock.disableNetConnect();
}

/**
 * Enable real HTTP requests (should be called in test teardown)
 */
export function enableNetRequests(): void {
  nock.enableNetConnect();
}

/**
 * Check if all mocks have been used
 */
export function pendingMocks(): string[] {
  return nock.pendingMocks();
}
