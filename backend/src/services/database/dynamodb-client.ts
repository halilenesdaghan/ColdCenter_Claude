import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * DynamoDB Client Configuration
 */
const dynamoDBConfig: any = {
  region: config.aws.region,
};

// Use local DynamoDB if endpoint is specified
if (config.dynamodb.endpoint) {
  dynamoDBConfig.endpoint = config.dynamodb.endpoint;
  dynamoDBConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
} else if (config.aws.access_key_id && config.aws.secret_access_key) {
  dynamoDBConfig.credentials = {
    accessKeyId: config.aws.access_key_id,
    secretAccessKey: config.aws.secret_access_key,
  };
}

// Create DynamoDB client
const client = new DynamoDBClient(dynamoDBConfig);

// Create DynamoDB Document Client (for easier object handling)
export const dynamoDBClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

/**
 * Table names with prefix
 */
export const Tables = {
  CALL_SESSIONS: `${config.dynamodb.table_prefix}call_sessions`,
  CALL_TRANSCRIPTS: `${config.dynamodb.table_prefix}call_transcripts`,
  APPOINTMENTS: `${config.dynamodb.table_prefix}appointments`,
  FOLLOW_UP_QUEUE: `${config.dynamodb.table_prefix}follow_up_queue`,
  CUSTOMERS: `${config.dynamodb.table_prefix}customers`,
  ANALYTICS_DAILY: `${config.dynamodb.table_prefix}analytics_daily`,
};

/**
 * Generic DynamoDB operations wrapper
 */
export class DynamoDBService {
  /**
   * Get item by primary key
   */
  async get(tableName: string, key: Record<string, any>): Promise<any | null> {
    try {
      const command = new GetCommand({
        TableName: tableName,
        Key: key,
      });

      const response = await dynamoDBClient.send(command);
      return response.Item || null;
    } catch (error) {
      logger.error('DynamoDB get error', { tableName, key, error });
      throw error;
    }
  }

  /**
   * Put (create or replace) item
   */
  async put(tableName: string, item: Record<string, any>): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: tableName,
        Item: item,
      });

      await dynamoDBClient.send(command);
    } catch (error) {
      logger.error('DynamoDB put error', { tableName, item, error });
      throw error;
    }
  }

  /**
   * Update item
   */
  async update(
    tableName: string,
    key: Record<string, any>,
    updates: Record<string, any>,
  ): Promise<any> {
    try {
      const updateExpression: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.keys(updates).forEach((field, index) => {
        const placeholder = `#field${index}`;
        const valuePlaceholder = `:value${index}`;

        updateExpression.push(`${placeholder} = ${valuePlaceholder}`);
        expressionAttributeNames[placeholder] = field;
        expressionAttributeValues[valuePlaceholder] = updates[field];
      });

      const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      const response = await dynamoDBClient.send(command);
      return response.Attributes;
    } catch (error) {
      logger.error('DynamoDB update error', { tableName, key, updates, error });
      throw error;
    }
  }

  /**
   * Delete item
   */
  async delete(tableName: string, key: Record<string, any>): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: tableName,
        Key: key,
      });

      await dynamoDBClient.send(command);
    } catch (error) {
      logger.error('DynamoDB delete error', { tableName, key, error });
      throw error;
    }
  }

  /**
   * Query items
   */
  async query(
    tableName: string,
    keyCondition: string,
    expressionAttributeValues: Record<string, any>,
    options?: {
      indexName?: string;
      limit?: number;
      scanIndexForward?: boolean;
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
    },
  ): Promise<any[]> {
    try {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionAttributeValues,
        IndexName: options?.indexName,
        Limit: options?.limit,
        ScanIndexForward: options?.scanIndexForward,
        FilterExpression: options?.filterExpression,
        ExpressionAttributeNames: options?.expressionAttributeNames,
      });

      const response = await dynamoDBClient.send(command);
      return response.Items || [];
    } catch (error) {
      logger.error('DynamoDB query error', { tableName, keyCondition, error });
      throw error;
    }
  }

  /**
   * Scan table (use sparingly, prefer query)
   */
  async scan(
    tableName: string,
    options?: {
      limit?: number;
      filterExpression?: string;
      expressionAttributeValues?: Record<string, any>;
      expressionAttributeNames?: Record<string, string>;
    },
  ): Promise<any[]> {
    try {
      const command = new ScanCommand({
        TableName: tableName,
        Limit: options?.limit,
        FilterExpression: options?.filterExpression,
        ExpressionAttributeValues: options?.expressionAttributeValues,
        ExpressionAttributeNames: options?.expressionAttributeNames,
      });

      const response = await dynamoDBClient.send(command);
      return response.Items || [];
    } catch (error) {
      logger.error('DynamoDB scan error', { tableName, error });
      throw error;
    }
  }

  /**
   * Batch get items
   */
  async batchGet(tableName: string, keys: Record<string, any>[]): Promise<any[]> {
    try {
      const command = new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: keys,
          },
        },
      });

      const response = await dynamoDBClient.send(command);
      return response.Responses?.[tableName] || [];
    } catch (error) {
      logger.error('DynamoDB batch get error', { tableName, keys, error });
      throw error;
    }
  }

  /**
   * Batch write items
   */
  async batchWrite(tableName: string, items: Record<string, any>[]): Promise<void> {
    try {
      const putRequests = items.map((item) => ({
        PutRequest: {
          Item: item,
        },
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [tableName]: putRequests,
        },
      });

      await dynamoDBClient.send(command);
    } catch (error) {
      logger.error('DynamoDB batch write error', { tableName, items, error });
      throw error;
    }
  }
}

// Export singleton instance
export const dynamoDBService = new DynamoDBService();
