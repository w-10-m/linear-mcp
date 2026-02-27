#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CancelledNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { loadConfig, validateConfig } from './config.js';
import { LogShipper } from './services/log-shipper.js';
import { Logger } from './services/logger.js';
import { RequestTracker } from './services/request-tracker.js';
import { ProgressReporter } from './services/progress-reporter.js';

// Load environment variables
config();

// Import tools from each template
import { LinearTools } from './tools/linear-tools.js';
import { LinearClient } from './clients/linear-client.js';

// Import OAuth clients only if OAuth is enabled globally

// Import unified OAuth clients for special cases

class LinearMcpServer {
  private server: Server;
  private logShipper!: LogShipper;
  private logger!: Logger;
  private requestTracker!: RequestTracker;
  private progressReporter!: ProgressReporter;
  
  // Initialize template tools
  private linearTools: LinearTools;
  private linearClient: LinearClient;
  
  // OAuth clients

  constructor() {
    // Initialize logging first
    this.initializeLogging();
    
    this.server = new Server(
      {
        name: 'linear-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize OAuth clients first

    // Initialize template clients and tools
    // Regular client - pass configuration object
    this.linearClient = new LinearClient({
      authToken: process.env.LINEAR_API_KEY,
      lINEARAPIKEY: process.env.LINEAR_API_KEY,
      api_version: "2021-01-01",
      logger: this.logger
    });
    this.linearTools = new LinearTools(this.linearClient);

    this.setupHandlers();
    this.setupNotificationHandlers();
  }

  private initializeLogging() {
    const config = loadConfig();
    const validation = validateConfig(config);
    
    if (!validation.isValid) {
      console.error('Configuration validation failed:', validation.errors);
      process.exit(1);
    }
    
    this.logShipper = new LogShipper(config.logShipping);
    this.logger = new Logger({
      logLevel: config.logShipping.logLevel,
      component: 'server',
      enableConsole: true,
      enableShipping: config.logShipping.enabled,
      serverName: 'linear-mcp',
      logShipper: this.logShipper
    });
    
    this.logger.info('SERVER_INIT', 'MCP server initializing', {
      serverName: 'linear-mcp',
      logShippingEnabled: config.logShipping.enabled,
      logLevel: config.logShipping.logLevel
    });
    
    // Initialize request tracking and progress reporting
    this.requestTracker = new RequestTracker(this.logger);
    this.progressReporter = new ProgressReporter(
      this.server,
      this.logger,
      this.requestTracker
    );
    
    // Set up periodic cleanup
    setInterval(() => {
      this.requestTracker.cleanupStaleRequests();
      this.progressReporter.cleanupCompletedRequests();
    }, 60000);
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];
      
      // Add linear tools
      tools.push(...this.linearTools.getToolDefinitions());

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;
      const requestId = extra.requestId;
      const progressToken = request.params._meta?.progressToken;
      
      // Register request for tracking
      const context = this.requestTracker.registerRequest(
        requestId,
        progressToken,
        name
      );

      try {
        // Handle linear tools
        if (this.linearTools.canHandle(name)) {
          return await this.linearTools.executeTool(name, args, context, this.progressReporter);
        }

        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      } catch (error) {
        // Check if error is due to cancellation
        if (context.abortController.signal.aborted) {
          this.logger.info('REQUEST_ABORTED', 'Request was cancelled', {
            requestId,
            toolName: name,
            reason: context.abortController.signal.reason
          });
          throw new McpError(
            ErrorCode.InternalError,
            'Request was cancelled'
          );
        }
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        // Clean up request tracking
        this.requestTracker.cleanup(requestId);
      }
    });
  }

  private setupNotificationHandlers() {
    // Handle cancellation notifications
    this.server.setNotificationHandler(CancelledNotificationSchema, async (notification) => {
      const { requestId, reason } = notification.params;

      this.logger.info('CANCELLATION_RECEIVED', 'Received cancellation notification', {
        requestId,
        reason
      });

      if (requestId === undefined) {
        this.logger.debug('CANCELLATION_IGNORED', 'Cancellation ignored - no requestId provided', {});
        return;
      }

      // Cancel the request
      const cancelled = this.requestTracker.cancelRequest(requestId, reason);
      
      if (!cancelled) {
        this.logger.debug('CANCELLATION_IGNORED', 'Cancellation ignored - request not found or already completed', {
          requestId
        });
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logger.info('SERVER_START', 'MCP server started successfully', {
      serverName: 'linear-mcp',
      transport: 'stdio'
    });
    
    console.error('linear-mcp MCP server running on stdio');
    
    // Handle graceful shutdown for log shipping
    const shutdown = async () => {
      this.logger.info('SERVER_SHUTDOWN', 'MCP server shutting down', {
        serverName: 'linear-mcp'
      });
      
      // Shutdown request tracking and progress reporting
      if (this.requestTracker) {
        this.requestTracker.shutdown();
      }
      if (this.progressReporter) {
        this.progressReporter.shutdown();
      }
      
      // Shutdown logging
      if (this.logShipper) {
        await this.logShipper.shutdown();
      }
      
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

const server = new LinearMcpServer();
server.run().catch(console.error);