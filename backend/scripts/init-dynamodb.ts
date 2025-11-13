#!/usr/bin/env ts-node

/**
 * Initialize DynamoDB tables
 * Usage: npm run db:init
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

const dynamoDBConfig: any = {
  region: config.aws.region,
};

if (config.dynamodb.endpoint) {
  dynamoDBConfig.endpoint = config.dynamodb.endpoint;
  dynamoDBConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
}

const client = new DynamoDBClient(dynamoDBConfig);

/**
 * Table definitions
 */
const tables = [
  {
    TableName: `${config.dynamodb.table_prefix}call_sessions`,
    KeySchema: [{ AttributeName: 'call_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'call_id', AttributeType: 'S' },
      { AttributeName: 'customer_phone', AttributeType: 'S' },
      { AttributeName: 'created_at', AttributeType: 'N' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'customer_phone_index',
        KeySchema: [
          { AttributeName: 'customer_phone', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'status_created_index',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `${config.dynamodb.table_prefix}call_transcripts`,
    KeySchema: [
      { AttributeName: 'call_id', KeyType: 'HASH' },
      { AttributeName: 'sequence', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'call_id', AttributeType: 'S' },
      { AttributeName: 'sequence', AttributeType: 'N' },
    ],
  },
  {
    TableName: `${config.dynamodb.table_prefix}appointments`,
    KeySchema: [{ AttributeName: 'appointment_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'appointment_id', AttributeType: 'S' },
      { AttributeName: 'customer_phone', AttributeType: 'S' },
      { AttributeName: 'appointment_date', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'customer_phone_index',
        KeySchema: [{ AttributeName: 'customer_phone', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'appointment_date_index',
        KeySchema: [{ AttributeName: 'appointment_date', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'status_index',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'appointment_date', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `${config.dynamodb.table_prefix}follow_up_queue`,
    KeySchema: [{ AttributeName: 'task_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'task_id', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'scheduled_at', AttributeType: 'N' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'scheduled_at_index',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'scheduled_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `${config.dynamodb.table_prefix}customers`,
    KeySchema: [{ AttributeName: 'customer_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'customer_id', AttributeType: 'S' },
      { AttributeName: 'customer_phone', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'customer_phone_index',
        KeySchema: [{ AttributeName: 'customer_phone', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: `${config.dynamodb.table_prefix}analytics_daily`,
    KeySchema: [
      { AttributeName: 'date', KeyType: 'HASH' },
      { AttributeName: 'metric_name', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'date', AttributeType: 'S' },
      { AttributeName: 'metric_name', AttributeType: 'S' },
    ],
  },
];

/**
 * Check if table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const command = new DescribeTableCommand({ TableName: tableName });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

/**
 * Create table
 */
async function createTable(tableDefinition: any): Promise<void> {
  const exists = await tableExists(tableDefinition.TableName);

  if (exists) {
    logger.info(`Table ${tableDefinition.TableName} already exists, skipping...`);
    return;
  }

  const command = new CreateTableCommand({
    ...tableDefinition,
    BillingMode: 'PAY_PER_REQUEST',
  });

  try {
    await client.send(command);
    logger.info(`Created table: ${tableDefinition.TableName}`);
  } catch (error) {
    logger.error(`Failed to create table: ${tableDefinition.TableName}`, error);
    throw error;
  }
}

/**
 * Initialize all tables
 */
async function initializeTables(): Promise<void> {
  logger.info('Initializing DynamoDB tables...');
  logger.info(`Endpoint: ${config.dynamodb.endpoint || 'AWS'}`);
  logger.info(`Table prefix: ${config.dynamodb.table_prefix}`);

  try {
    // List existing tables
    const listCommand = new ListTablesCommand({});
    const listResponse = await client.send(listCommand);
    logger.info(`Existing tables: ${listResponse.TableNames?.length || 0}`);

    // Create tables
    for (const tableDefinition of tables) {
      await createTable(tableDefinition);
    }

    logger.info('✅ All tables initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize tables', error);
    process.exit(1);
  }
}

// Run initialization
initializeTables()
  .then(() => {
    logger.info('Database initialization complete');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Database initialization failed', error);
    process.exit(1);
  });
