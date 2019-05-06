// @flow

import { addDays } from 'date-fns';
import pool from './database';
import type {
  UserTableConfig, UserAccount, ReportSettings, ClientInfo, Config
} from './types';

async function queryRows<T>(text: string, params: Array<string>): Promise<Array<?T>> {
  const { rows } = await pool.query(text, params);
  return rows;
}

export function ensureReportsTableExists({
  databaseConfig: {
    connection: { user }
  }
}: Config): Promise<void> {
  return pool.query(
    `
CREATE TABLE IF NOT EXISTS ace_gdpr_settings (
    id integer NOT NULL DEFAULT 1,
    last_reported_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    cycle CHARACTER VARYING(255)
);

ALTER TABLE ace_gdpr_settings OWNER TO ${user};

CREATE SEQUENCE IF NOT EXISTS ace_gdpr_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ace_gdpr_settings_id_seq OWNER TO ${user};

ALTER SEQUENCE ace_gdpr_settings_id_seq OWNED BY ace_gdpr_settings.id;
  `
  );
}

export async function findOrInsertSettings(): Promise<ReportSettings> {
  const rows: Array<?ReportSettings> = await queryRows(
    'SELECT last_reported_at as "lastReportedAt", cycle FROM ace_gdpr_settings',
    []
  );
  if (rows.length > 0 && rows[0]) {
    return rows[0];
  }
  // insert data into empty table
  const lastReportedAt = addDays(new Date(), -1);
  const cycle = '15 Days';
  await queryRows('INSERT INTO ace_gdpr_settings(last_reported_at, cycle) VALUES($1, $2)', [
    lastReportedAt.toISOString(),
    cycle
  ]);
  return { lastReportedAt, cycle };
}

export function findClientKeys({
  tableName,
  columns: { clientKey }
}: UserTableConfig): Promise<Array<?{ clientKey: string }>> {
  return queryRows(`SELECT DISTINCT "${clientKey}" as "clientKey" FROM "${tableName}" ORDER BY "${clientKey}" ASC`, []);
}

export async function findUserAccounts(
  clientKeyValue: string,
  { tableName, columns: { userAccountId, updatedAt, clientKey } }: UserTableConfig
): Promise<Array<?UserAccount>> {
  return queryRows(
    `SELECT "${userAccountId}" as "accountId", "${updatedAt}" as "updatedAt" FROM "${tableName}" WHERE "${clientKey}" = $1 ORDER BY "${userAccountId}" ASC`,
    [clientKeyValue]
  );
}

export async function findClientInfo(clientKey: string): Promise<?ClientInfo> {
  const rows: Array<?ClientInfo> = await queryRows(
    "SELECT val->'sharedSecret' AS secret, val->'baseUrl' AS url, val->'key' as key FROM \"AddonSettings\" WHERE key = 'clientInfo' and \"clientKey\" = $1",
    [clientKey]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function udpateReportSettings(cycle: ?string): Promise<any> {
  if (cycle) {
    return pool.query('UPDATE ace_gdpr_settings SET last_reported_at = NOW(), cycle= $1', [cycle]);
  }
  return pool.query('UPDATE ace_gdpr_settings SET last_reported_at = NOW()');
}
