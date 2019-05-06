// @flow
import type { Config } from './types';

export const RETRY = 429;

export const REPORT_ACCOUNTS_METHOD = 'post';
export const REPORT_ACCOUNTS_PATH = '/rest/atlassian-connect/latest/report-accounts';

export const DEFAULT_CONFIG: Config = {
  logger: console,
  databaseConfig: {
    connection: {
      host: process.env.PGHOST || 'db',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'password',
      port: process.env.PGPORT || '5432',
      database: process.env.PGDATABASE || 'postgres'
    },
    users: {
      tableName: 'users',
      columns: {
        updatedAt: 'updated_at',
        userAccountId: 'user_account_id',
        clientKey: 'client_key'
      }
    }
  },
  forceExecution: false
};
