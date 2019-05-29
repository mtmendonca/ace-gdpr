// @flow

export type UserTableConfig = {
  tableName: string,
  columns: {
    updatedAt: string,
    userAccountId: string,
    clientKey: string
  }
};

export type DbConnectionConfig = {
  host: string,
  user: string,
  password: string,
  port: string,
  database: string
};

export type DatabaseConfig = {
  connection: DbConnectionConfig,
  users: UserTableConfig
};

export type Config = {
  reportAccountsPath: string,
  reportAccountsMethod: string,
  logger: {
    +log: Function,
    +warn: Function,
    +error: Function
  },
  databaseConfig: DatabaseConfig,
  forceExecution: boolean
};

export type ReportSettings = {
  cycle: string,
  lastReportedAt: Date
};

export type UserAccount = {
  accountId: string,
  udpatedAt: Date,
  clientKey: string
};

export type TokenData = {
  iss: string,
  iat: number,
  exp: number,
  qsh: string
};

export type ClientInfo = {
  secret: string,
  url: string,
  key: string
};

export type Set<T> = {
  [key: string]: T
};

export type JiraUserAccount = {
  accountId: string,
  status: string
};

export type JiraPollResponse = {
  accounts: Array<JiraUserAccount>,
  newCyclePeriod?: string
};

export type PollResult = {
  statusCode: number,
  retryAfter?: number,
  data?: JiraPollResponse
};

export type ClientUpdates = {
  statuses: Array<JiraUserAccount>,
  cycle: string
};

export type CompiledResults = {
  updated: Array<string>,
  closed: Array<string>,
  cycle: ?string
};
