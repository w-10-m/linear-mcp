import axios, { AxiosInstance } from 'axios';
import { Logger } from '../services/logger.js';
import { RequestOptions, ProgressCallback } from '../types.js';

export interface LinearClientConfig {
  lINEARAPIKEY?: string;
  api_version?: any;
  timeout?: number;
  rateLimit?: number; // requests per minute
  authToken?: string;
  logger?: Logger;
}

export class LinearClient {
  private httpClient: AxiosInstance;
  private config: LinearClientConfig;
  private sessionId: string;
  private logger: Logger;

  constructor(config: LinearClientConfig) {
    this.config = config;
    
    // Generate unique session ID for this client instance
    this.sessionId = `linear-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Initialize logger (fallback to console if not provided)
    this.logger = config.logger || new Logger(
      {
        logLevel: 'ERROR',
        component: 'client',
        enableConsole: true,
        enableShipping: false,
        serverName: 'linear-mcp'
      }
    );
    
    this.logger.info('CLIENT_INIT', 'Client instance created', { 
      baseUrl: this.resolveBaseUrl(),
      timeout: this.config.timeout || 30000,
      hasRateLimit: !!this.config.rateLimit,
      configKeys: Object.keys(config)
    });

    
    this.httpClient = axios.create({
      baseURL: this.resolveBaseUrl(),
      timeout: this.config.timeout || 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'linear-mcp/1.0.0',
        ...this.getAuthHeaders()
      },
    });

    // Add request interceptor for rate limiting
    if (this.config.rateLimit) {
      this.setupRateLimit(this.config.rateLimit);
    }

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.logRequestStart(
          config.method?.toUpperCase() || 'GET',
          `${config.baseURL}${config.url}`,
          {
            hasData: !!config.data,
            hasParams: !!(config.params && Object.keys(config.params).length > 0),
            headers: Object.keys(config.headers || {})
          }
        );
        
        if (config.data) {
          this.logger.debug('HTTP_REQUEST_BODY', 'Request body data', {
            dataType: typeof config.data,
            dataSize: JSON.stringify(config.data).length
          });
        }
        
        if (config.params && Object.keys(config.params).length > 0) {
          this.logger.debug('HTTP_REQUEST_PARAMS', 'Query parameters', {
            paramCount: Object.keys(config.params).length,
            paramKeys: Object.keys(config.params)
          });
        }
        
        return config;
      },
      (error) => {
        this.logger.error('HTTP_REQUEST_ERROR', 'Request interceptor error', {
          error: error.message,
          code: error.code
        });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.logRequestSuccess(
          response.config?.method?.toUpperCase() || 'GET',
          `${response.config?.baseURL}${response.config?.url}`,
          response.status,
          0, // Duration will be calculated in endpoint methods
          {
            statusText: response.statusText,
            responseSize: JSON.stringify(response.data).length,
            headers: Object.keys(response.headers || {})
          }
        );
        return response;
      },
      (error) => {
        this.logger.logRequestError(
          error.config?.method?.toUpperCase() || 'GET',
          `${error.config?.baseURL}${error.config?.url}`,
          error,
          0, // Duration will be calculated in endpoint methods
          {
            hasResponseData: !!error.response?.data
          }
        );
        throw error;
      }
    );
  }

  private setupRateLimit(requestsPerMinute: number) {
    const interval = 60000 / requestsPerMinute; // ms between requests
    let lastRequestTime = 0;

    this.logger.info('RATE_LIMIT_SETUP', 'Rate limiting configured', {
      requestsPerMinute,
      intervalMs: interval
    });

    this.httpClient.interceptors.request.use(async (config) => {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      
      if (timeSinceLastRequest < interval) {
        const delayMs = interval - timeSinceLastRequest;
        this.logger.logRateLimit('HTTP_REQUEST', delayMs, {
          timeSinceLastRequest,
          requiredInterval: interval
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      lastRequestTime = Date.now();
      return config;
    });
  }

  private resolveBaseUrl(): string {
    // Debug logging for base_url resolution
    // console.error('[LinearClient] Resolving base URL...');
    // console.error('[LinearClient] Template base_url:', 'https://api.linear.app/graphql');
    // console.error('[LinearClient] CustomConfig baseUrl:', '');
    
    let baseUrl = 'https://api.linear.app/graphql';
    
    // console.error('[LinearClient] Initial resolved baseUrl:', baseUrl);
    
    // If no base URL was found, throw an error
    if (!baseUrl) {
      throw new Error(`No base URL configured for linear. Please provide base_url in template or customConfig.baseUrl.`);
    }
    
    // Handle dynamic domain replacement for patterns like CONFLUENCE_DOMAIN, JIRA_DOMAIN, etc.
    const domainEnvVar = `LINEAR_DOMAIN`;
    const domain = process.env[domainEnvVar];
    // console.error(`[LinearClient] Domain env var (${domainEnvVar}):`, domain);
    
    // Check for SERVICE_DOMAIN pattern (e.g., CONFLUENCE_DOMAIN, JIRA_DOMAIN, SLACK_DOMAIN)
    // This handles both YOUR_DOMAIN and {SERVICE}_DOMAIN patterns in base URLs
    if (baseUrl.includes('YOUR_DOMAIN') || baseUrl.includes(`${domainEnvVar}`)) {
      if (!domain) {
        throw new Error(`Missing domain configuration. Please set ${domainEnvVar} environment variable.`);
      }
      
      // Replace the placeholder with the actual domain value
      // This handles patterns like https://CONFLUENCE_DOMAIN.atlassian.net
      if (baseUrl.includes('YOUR_DOMAIN')) {
        baseUrl = baseUrl.replace(/YOUR_DOMAIN/g, domain);
      } 
      if (baseUrl.includes(`${domainEnvVar}`)) {
        // Replace all occurrences of the service-specific domain placeholder
        const regex = new RegExp(domainEnvVar, 'g');
        baseUrl = baseUrl.replace(regex, domain);
      }
      
      this.logger.info('DOMAIN_RESOLVED', `Resolved base URL with domain`, {
        template: 'linear',
        baseUrl: baseUrl
      });
    }
    
    // console.error('[LinearClient] Final resolved baseUrl:', baseUrl);
    return baseUrl;
  }

  private getAuthHeaders(): Record<string, string> {
    // Bearer/API key authentication (static tokens)
    // Determine the correct environment variable name based on auth type and configuration
    let envVarName;
    // Use explicitly specified env_var (e.g., Linear specifies LINEAR_API_KEY, JIRA specifies JIRA_API_KEY)
    envVarName = 'LINEAR_API_KEY';
    
    const token = this.config.authToken || process.env.LINEAR_API_KEY;
    if (token) {
      this.logger.logAuthEvent('static_token_auth_setup', true, {
        authType: 'api_key',
        tokenPreview: token.substring(0, 8) + '...',
        header: 'authorization-no-bearer',
        source: 'static_configuration',
        envVar: envVarName
      });
      return {
        'Authorization': `${token}`
      };
    }
    this.logger.warn('AUTH_WARNING', 'No authentication token found', {
      authType: 'api_key',
      warning: 'API calls may be rate limited',
      checkedSources: ['config.authToken', 'environment variables'],
      expectedEnvVar: envVarName
    });
    return {};
      }

  /**
   * Initialize the client (for OAuth clients that need initialization)
   */
  async initialize(): Promise<void> {
    this.logger.debug('CLIENT_INITIALIZE', 'No initialization required for this auth type');
      }

  /**
   * Get the session ID for this client instance
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Make an authenticated request with proper headers and cancellation support
   */
  private async makeAuthenticatedRequest(config: any, options?: RequestOptions): Promise<any> {
    // Add abort signal if provided
    if (options?.signal) {
      config.signal = options.signal;
    }
    // For non-OAuth requests, log what auth headers are being used
    this.logger.info('REQUEST_AUTH', 'Using pre-configured authentication headers', {
      authType: 'static',
      requestUrl: config.url,
      authHeaders: config.headers?.Authorization ? 'present' : 'missing',
      headerKeys: Object.keys(config.headers || {})
    });
        
    return this.httpClient.request(config);
  }

  private buildPath(template: string, params: Record<string, any>): string {
    let path = template;
    
    // Custom encoding that preserves forward slashes for API paths
    const encodePathComponent = (value: string): string => {
      // For Google API resource names like "people/c123", preserve the forward slash
      return encodeURIComponent(value).replace(/%2F/g, '/');
    };
    
    // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
    const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
    let match;
    const processedParams: string[] = [];
    
    while ((match = googlePathTemplateRegex.exec(template)) !== null) {
      const fullMatch = match[0]; // e.g., "{resourceName=people/*}"
      const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
      
      if (paramName && params[paramName] !== undefined) {
        path = path.replace(fullMatch, encodePathComponent(String(params[paramName])));
        processedParams.push(paramName);
      }
    }
    
    // Handle standard path templates: {resourceName}
    for (const [key, value] of Object.entries(params)) {
      if (!processedParams.includes(key)) {
        const standardTemplate = `{${key}}`;
        if (path.includes(standardTemplate)) {
          path = path.replace(standardTemplate, encodePathComponent(String(value)));
          processedParams.push(key);
        }
      }
    }
    
    this.logger.debug('PATH_BUILD', 'Built API path from template', {
      template,
      resultPath: path,
      paramCount: Object.keys(params).length,
      paramKeys: Object.keys(params),
      processedParams,
      hasGoogleTemplates: googlePathTemplateRegex.test(template)
    });
    return path;
  }

  /* DEBUG: endpoint={"name":"create_issue","method":"POST","path":"/","description":"Create a new issue with title, description, and team assignment","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to create an issue","location":"body","default":"mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title description priority state { name } assignee { name email } team { name } createdAt updatedAt } } }"},"variables":{"type":"object","required":true,"description":"Variables for the mutation including title, description, teamId, priority, assigneeId","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async createIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'create_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting create_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed create_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'create_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'create_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'create_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute create_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"get_issue","method":"POST","path":"/","description":"Retrieve issue details by ID or identifier","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to get issue details","location":"body","default":"query GetIssue($id: String!) { issue(id: $id) { id identifier title description priority estimate state { name } assignee { id name email } team { id name } labels { nodes { id name color } } project { id name } createdAt updatedAt } }"},"variables":{"type":"object","required":true,"description":"Variables containing the issue ID","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async getIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'get_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting get_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed get_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'get_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'get_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'get_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute get_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"update_issue","method":"POST","path":"/","description":"Update issue properties including title, description, priority, and state","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to update an issue","location":"body","default":"mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title description priority state { name } assignee { name email } updatedAt } } }"},"variables":{"type":"object","required":true,"description":"Variables containing issue ID and update input","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async updateIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'update_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting update_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed update_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'update_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'update_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'update_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute update_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"delete_issue","method":"POST","path":"/","description":"Delete an issue by ID","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to delete an issue","location":"body","default":"mutation DeleteIssue($id: String!) { issueDelete(id: $id) { success } }"},"variables":{"type":"object","required":true,"description":"Variables containing the issue ID to delete","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async deleteIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'delete_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting delete_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed delete_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'delete_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'delete_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'delete_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute delete_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_issues","method":"POST","path":"/","description":"List issues with optional filtering by team, state, assignee, and labels","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list issues","location":"body","default":"query ListIssues($filter: IssueFilter, $orderBy: PaginationOrderBy, $first: Int, $after: String) { issues(filter: $filter, orderBy: $orderBy, first: $first, after: $after) { nodes { id identifier title description priority state { name } assignee { name email } team { name } createdAt updatedAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for filtering and pagination","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async listIssues(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_issues',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_issues request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_issues request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_issues',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_issues',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_issues',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_issues: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_teams","method":"POST","path":"/","description":"List all teams in the workspace using simplified query structure. Removed problematic fields (timezone, private, archivedAt, members) to resolve 400 Bad Request errors. Returns core team identification data (id, name, key).","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list teams","location":"body","default":"query ListTeams { teams { id name key } }"},"variables":{"type":"object","required":false,"description":"No variables needed for the basic query","location":"body"}},"response_format":"json","category":"Team Organization"} */
  async listTeams(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_teams',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_teams request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_teams request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_teams',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_teams',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_teams',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_teams: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"get_team","method":"POST","path":"/","description":"Get team details including members and settings","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to get team details","location":"body","default":"query GetTeam($id: String!) { team(id: $id) { id name key description timezone private archivedAt members { nodes { id name email role active } } states { nodes { id name type color position } } } }"},"variables":{"type":"object","required":true,"description":"Variables containing the team ID","location":"body"}},"response_format":"json","category":"Team Organization"} */
  async getTeam(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'get_team',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting get_team request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed get_team request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'get_team',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'get_team',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'get_team',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute get_team: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_users","method":"POST","path":"/","description":"List all users in the workspace","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list users","location":"body","default":"query ListUsers($first: Int, $after: String) { users(first: $first, after: $after) { nodes { id name displayName email avatarUrl active admin guest createdAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for pagination","location":"body"}},"response_format":"json","category":"Data Operations"} */
  async listUsers(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_users',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_users request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_users request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_users',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_users',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_users',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_users: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"get_user","method":"POST","path":"/","description":"Get user details and profile information","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to get user details","location":"body","default":"query GetUser($id: String!) { user(id: $id) { id name displayName email avatarUrl active admin guest timezone createdAt assignedIssues { nodes { id identifier title } } } }"},"variables":{"type":"object","required":true,"description":"Variables containing the user ID","location":"body"}},"response_format":"json","category":"Data Operations"} */
  async getUser(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'get_user',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting get_user request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed get_user request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'get_user',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'get_user',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'get_user',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute get_user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"assign_issue","method":"POST","path":"/","description":"Assign a user to an issue","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to assign user to issue","location":"body","default":"mutation AssignIssue($id: String!, $assigneeId: String!) { issueUpdate(id: $id, input: {assigneeId: $assigneeId}) { success issue { id identifier title assignee { id name email } } } }"},"variables":{"type":"object","required":true,"description":"Variables containing issue ID and assignee ID","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async assignIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'assign_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting assign_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed assign_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'assign_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'assign_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'assign_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute assign_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"create_project","method":"POST","path":"/","description":"Create a new project","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to create a project","location":"body","default":"mutation CreateProject($input: ProjectCreateInput!) { projectCreate(input: $input) { success project { id name description state targetDate progress createdAt } } }"},"variables":{"type":"object","required":true,"description":"Variables for project creation including name, description, and team IDs","location":"body"}},"response_format":"json","category":"Project Milestones"} */
  async createProject(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'create_project',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting create_project request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed create_project request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'create_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'create_project',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'create_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute create_project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"get_project","method":"POST","path":"/","description":"Get project details including associated issues","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to get project details","location":"body","default":"query GetProject($id: String!) { project(id: $id) { id name description state targetDate progress createdAt updatedAt issues { nodes { id identifier title state { name } assignee { name } } } members { nodes { id name email } } } }"},"variables":{"type":"object","required":true,"description":"Variables containing the project ID","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async getProject(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'get_project',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting get_project request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed get_project request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'get_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'get_project',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'get_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute get_project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_projects","method":"POST","path":"/","description":"List all projects with optional filtering","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list projects","location":"body","default":"query ListProjects($filter: ProjectFilter, $first: Int, $after: String) { projects(filter: $filter, first: $first, after: $after) { nodes { id name description state targetDate progress createdAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for filtering and pagination","location":"body"}},"response_format":"json","category":"Project Milestones"} */
  async listProjects(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_projects',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_projects request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_projects request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_projects',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_projects',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_projects',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"update_project","method":"POST","path":"/","description":"Update project properties","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to update a project","location":"body","default":"mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) { projectUpdate(id: $id, input: $input) { success project { id name description state targetDate progress updatedAt } } }"},"variables":{"type":"object","required":true,"description":"Variables containing project ID and update input","location":"body"}},"response_format":"json","category":"Project Milestones"} */
  async updateProject(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'update_project',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting update_project request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed update_project request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'update_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'update_project',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'update_project',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute update_project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_workflow_states","method":"POST","path":"/","description":"List all workflow states available in the workspace","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list workflow states","location":"body","default":"query ListWorkflowStates($first: Int, $after: String) { workflowStates(first: $first, after: $after) { nodes { id name type color position description team { id name } } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for pagination","location":"body"}},"response_format":"json","category":"Data Operations"} */
  async listWorkflowStates(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_workflow_states',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_workflow_states request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_workflow_states request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_workflow_states',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_workflow_states',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_workflow_states',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_workflow_states: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"transition_issue","method":"POST","path":"/","description":"Transition an issue to a different workflow state","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to transition issue state","location":"body","default":"mutation TransitionIssue($id: String!, $stateId: String!) { issueUpdate(id: $id, input: {stateId: $stateId}) { success issue { id identifier title state { id name type color } updatedAt } } }"},"variables":{"type":"object","required":true,"description":"Variables containing issue ID and target state ID","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async transitionIssue(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'transition_issue',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting transition_issue request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed transition_issue request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'transition_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'transition_issue',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'transition_issue',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute transition_issue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"create_label","method":"POST","path":"/","description":"Create a new label for issue categorization","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to create a label","location":"body","default":"mutation CreateLabel($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id name color description } } }"},"variables":{"type":"object","required":true,"description":"Variables for label creation including name, color, and description","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async createLabel(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'create_label',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting create_label request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed create_label request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'create_label',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'create_label',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'create_label',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute create_label: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_labels","method":"POST","path":"/","description":"List all labels available in the workspace","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list labels","location":"body","default":"query ListLabels($first: Int, $after: String) { issueLabels(first: $first, after: $after) { nodes { id name color description createdAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for pagination","location":"body"}},"response_format":"json","category":"Label & Tags"} */
  async listLabels(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_labels',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_labels request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_labels request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_labels',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_labels',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_labels',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_labels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"apply_labels","method":"POST","path":"/","description":"Apply labels to an issue","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to apply labels to issue","location":"body","default":"mutation ApplyLabels($id: String!, $labelIds: [String!]!) { issueUpdate(id: $id, input: {labelIds: $labelIds}) { success issue { id identifier title labels { nodes { id name color } } } } }"},"variables":{"type":"object","required":true,"description":"Variables containing issue ID and array of label IDs","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async applyLabels(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'apply_labels',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting apply_labels request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed apply_labels request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'apply_labels',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'apply_labels',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'apply_labels',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute apply_labels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"search_issues","method":"POST","path":"/","description":"Search issues using filters (replaces deprecated issueSearch endpoint). Migrated from deprecated 'issueSearch' to current 'issues' endpoint with filtering. Use filter objects instead of text queries for more flexible and powerful search capabilities.","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to search issues","location":"body","default":"query SearchIssues($filter: IssueFilter, $first: Int, $after: String) { issues(filter: $filter, first: $first, after: $after) { nodes { id identifier title description priority state { name } assignee { name email } team { name } createdAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":true,"description":"Variables for filtering issues. Use 'filter' object to specify search criteria (e.g., {\"filter\": {\"title\": {\"contains\": \"search term\"}}}) instead of deprecated text query parameter","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async searchIssues(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'search_issues',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting search_issues request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed search_issues request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'search_issues',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'search_issues',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'search_issues',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute search_issues: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"get_viewer","method":"POST","path":"/","description":"Get current user information (viewer)","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to get viewer information","location":"body","default":"query GetViewer { viewer { id name displayName email avatarUrl active admin guest timezone organization { id name } } }"},"variables":{"type":"object","required":false,"description":"No variables needed for viewer query","location":"body"}},"response_format":"json","category":"Data Operations"} */
  async getViewer(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'get_viewer',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting get_viewer request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed get_viewer request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'get_viewer',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'get_viewer',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'get_viewer',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute get_viewer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"create_comment","method":"POST","path":"/","description":"Create a comment on an issue","parameters":{"query":{"type":"string","required":true,"description":"GraphQL mutation to create a comment","location":"body","default":"mutation CreateComment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body user { name email } issue { id identifier title } createdAt } } }"},"variables":{"type":"object","required":true,"description":"Variables for comment creation. Must be structured as: {\"input\": {\"issueId\": \"string\", \"body\": \"string\"}}. The issueId and body should be nested inside the input object, not as separate parameters.","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async createComment(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'create_comment',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting create_comment request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed create_comment request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'create_comment',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'create_comment',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'create_comment',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute create_comment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* DEBUG: endpoint={"name":"list_comments","method":"POST","path":"/","description":"List comments for an issue","parameters":{"query":{"type":"string","required":true,"description":"GraphQL query to list comments","location":"body","default":"query ListComments($filter: CommentFilter, $first: Int, $after: String) { comments(filter: $filter, first: $first, after: $after) { nodes { id body user { name email } issue { id identifier title } createdAt updatedAt } pageInfo { hasNextPage endCursor } } }"},"variables":{"type":"object","required":false,"description":"Variables for filtering and pagination","location":"body"}},"response_format":"json","category":"Issue Tracking"} */
  async listComments(params: any, options?: RequestOptions): Promise<any> {
    const startTime = Date.now();
    this.logger.info('ENDPOINT_START', 'Endpoint execution started', {
      endpoint: 'list_comments',
      method: 'POST',
      path: '/',
      paramCount: Object.keys(params || {}).length,
      paramKeys: Object.keys(params || {})
    });
    
    try {
      
      // Extract and separate parameters by location: path, query, body
      const pathTemplate = '/';
      const pathParams: Record<string, any> = {};
      const queryParams: Record<string, any> = {};
      const bodyParams: Record<string, any> = {};
      const extractedParams: string[] = [];
      
      // Handle Google-style path templates: {resourceName=people/*} and {person.resourceName=people/*}
      const googlePathTemplateRegex = /{([^}=]+)=[^}]*}/g;
      let match;
      
      while ((match = googlePathTemplateRegex.exec(pathTemplate)) !== null) {
        const paramName = match[1]; // e.g., "resourceName" or "person.resourceName"
        if (paramName && params[paramName] !== undefined) {
          pathParams[paramName] = params[paramName];
          extractedParams.push(paramName);
        }
      }
      
      // Handle standard path templates: {resourceName}
      const standardPathParams = pathTemplate.match(/{([^}=]+)}/g) || [];
      standardPathParams.forEach(paramTemplate => {
        const paramName = paramTemplate.slice(1, -1); // Remove { }
        // Only process if not already handled by Google template logic
        if (!extractedParams.includes(paramName)) {
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            extractedParams.push(paramName);
          } else {
            // Provide default values for optional path parameters
            if (paramName === 'userId') {
              pathParams[paramName] = 'me'; // Default to authenticated user
              extractedParams.push(paramName);
            }
          }
        }
      });
      
      // Check if any parameter has raw_array flag
      let hasRawArrayBody = false;
      let rawBodyData: any = undefined;
      
      // Separate remaining parameters by location (query vs body)
      if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            if (params[""] !== undefined) {
        bodyParams[""] = params[""];
        extractedParams.push("");
      }
            
      // Any remaining unprocessed parameters default to body for backward compatibility
      for (const [key, value] of Object.entries(params)) {
        if (!extractedParams.includes(key)) {
          bodyParams[key] = value;
        }
      }
      
      // Validate required parameters
      
      const path = this.buildPath('/', pathParams);
      // For GraphQL endpoints that use '/' as the path, use empty string to avoid double slash
      const requestPath = path === '/' ? '' : path;
      
      // Report initial progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 0,
          total: 100,
          message: `Starting list_comments request...`
        });
      }
      
      // Use standard HTTP client for other auth types with abort signal
      const requestConfig: any = {};
      if (options?.signal) {
        requestConfig.signal = options.signal;
      }
      
      const response = await this.httpClient.post(requestPath, hasRawArrayBody ? rawBodyData : (Object.keys(bodyParams).length > 0 ? bodyParams : undefined), { params: queryParams, ...requestConfig });
      
      // Report completion progress if callback provided
      if (options?.onProgress) {
        await options.onProgress({
          progress: 100,
          total: 100,
          message: `Completed list_comments request`
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('ENDPOINT_SUCCESS', 'Endpoint execution completed successfully', {
        endpoint: 'list_comments',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        responseDataSize: JSON.stringify(response.data).length
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is due to cancellation
      if (axios.isCancel(error)) {
        this.logger.info('REQUEST_CANCELLED', 'Request was cancelled', {
          endpoint: 'list_comments',
          method: 'POST',
          path: '/',
          duration_ms: duration
        });
        throw new Error('Request was cancelled');
      }
      
      this.logger.error('ENDPOINT_ERROR', 'Endpoint execution failed', {
        endpoint: 'list_comments',
        method: 'POST',
        path: '/',
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });
      throw new Error(`Failed to execute list_comments: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

}