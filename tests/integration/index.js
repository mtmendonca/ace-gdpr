/* eslint-disable no-unused-expressions */
import { use, expect } from 'chai';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import { addDays, differenceInDays } from 'date-fns';
import pool from '../../src/database';
import { DEFAULT_CONFIG } from '../../src/config';
import {
  ensureReportsTableExists,
  findOrInsertSettings,
  findClientKeys,
  findUserAccounts,
  findClientInfo,
  udpateReportSettings
} from '../../src/repository';

use(chaiAsPromised);
use(sinonChai);

describe('integration tests', () => {
  beforeEach(async () => {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
  });

  describe('ensureReportsTableExists', () => {
    it('creates reports table if it does not exist', async () => {
      await ensureReportsTableExists(DEFAULT_CONFIG);
      const result = await pool.query(
        `SELECT EXISTS ( 
          SELECT true 
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'ace_gdpr_settings')`
      );
      expect(result.rows.length).to.be.equals(1);
    });
  });

  describe('findOrInsertSettings', () => {
    it('inserts 15 day cycle and last reported date 14 days ago if table is empty', async () => {
      await ensureReportsTableExists(DEFAULT_CONFIG);
      const { lastReportedAt, cycle } = await findOrInsertSettings();

      expect(cycle).to.be.equals('15 Days');
      expect(differenceInDays(addDays(new Date(), -14), lastReportedAt)).to.be.equals(0);
    });

    it('returns settings if they exist', async () => {
      await ensureReportsTableExists(DEFAULT_CONFIG);
      const date = addDays(new Date(), -20);
      await pool.query('INSERT INTO ace_gdpr_settings(last_reported_at, cycle) VALUES($1, $2)', [
        date.toISOString(),
        '25 Days'
      ]);
      const { lastReportedAt, cycle } = await findOrInsertSettings();

      expect(cycle).to.be.equals('25 Days');
      expect(differenceInDays(date, lastReportedAt)).to.be.equals(0);
    });
  });

  describe('findClientKeys', () => {
    it('throws if user table does not exist', async () => expect(findClientKeys(DEFAULT_CONFIG.databaseConfig.users)).to.eventually.be.rejected);

    it('returns one row for each clientKey in users table', async () => {
      const {
        tableName,
        columns: { clientKey }
      } = DEFAULT_CONFIG.databaseConfig.users;

      await pool.query(`CREATE TABLE ${tableName} (${clientKey} CHARACTER VARYING(255))`);
      await pool.query(`INSERT INTO ${tableName}(${clientKey}) VALUES('123'),('123'),('456'),('456')`);

      const rows = await findClientKeys(DEFAULT_CONFIG.databaseConfig.users);
      expect(rows.length).to.be.equals(2);
      expect(rows).to.be.eql([{ clientKey: '123' }, { clientKey: '456' }]);
    });
  });

  describe('findUserAccounts', async () => {
    it('only returns client accounts for given clientKey', async () => {
      const {
        tableName,
        columns: { clientKey, userAccountId, updatedAt }
      } = DEFAULT_CONFIG.databaseConfig.users;

      await pool.query(
        `CREATE TABLE ${tableName} (
        ${clientKey} CHARACTER VARYING(255),
        ${userAccountId} CHARACTER VARYING(255),
        ${updatedAt} TIMESTAMP WITH TIME ZONE
      )`
      );
      await pool.query(
        `INSERT INTO ${tableName}(${clientKey},${userAccountId},${updatedAt})
       VALUES
       ('ck-1','cli-1','2019-05-18 15:36:00.000000+00'),
       ('ck-1','cli-2','2019-05-18 15:37:00.000000+00'),
       ('ck-2','cli-3','2019-05-18 15:38:00.000000+00'),
       ('ck-2','cli-4','2019-05-18 15:39:00.000000+00')`
      );

      const client1results = await findUserAccounts('ck-1', DEFAULT_CONFIG.databaseConfig.users);
      const client2results = await findUserAccounts('ck-2', DEFAULT_CONFIG.databaseConfig.users);
      const client3results = await findUserAccounts('ck-3', DEFAULT_CONFIG.databaseConfig.users);

      expect(client1results).to.be.eql([
        { accountId: 'cli-1', updatedAt: new Date('2019-05-18T15:36:00.000Z') },
        { accountId: 'cli-2', updatedAt: new Date('2019-05-18T15:37:00.000Z') }
      ]);
      expect(client2results).to.be.eql([
        { accountId: 'cli-3', updatedAt: new Date('2019-05-18T15:38:00.000Z') },
        { accountId: 'cli-4', updatedAt: new Date('2019-05-18T15:39:00.000Z') }
      ]);
      expect(client3results).to.be.eql([]);
    });
  });

  describe('findClientInfo', () => {
    it('retrieves JSON values from AddonSettings.val', async () => {
      await pool.query(
        `CREATE TABLE "AddonSettings" (
        "clientKey" CHARACTER VARYING(255),
        "key" CHARACTER VARYING(255),
        "val" JSON
      )`
      );
      await pool.query(
        'INSERT INTO "AddonSettings"("clientKey", key, val) VALUES(\'ck-1\',\'clientInfo\',\'{"sharedSecret": "shared-secret", "baseUrl": "base-url", "key": "addon-key"}\')'
      );

      const { secret, url, key } = await findClientInfo('ck-1');
      expect(secret).to.be.equals(secret);
      expect(url).to.be.equals(url);
      expect(key).to.be.equals(key);
    });
  });

  describe('udpateReportSettings', () => {
    it('updates settings with new cycle and last reported date', async () => {
      await ensureReportsTableExists(DEFAULT_CONFIG);

      const newDate = addDays(new Date(), -10);
      await pool.query("INSERT INTO ace_gdpr_settings(cycle, last_reported_at) VALUES('66 Days', $1)", [newDate]);
      const { lastReportedAt, cycle } = await findOrInsertSettings();

      expect(cycle).to.be.equals('66 Days');
      expect(lastReportedAt).to.be.eql(newDate);

      await udpateReportSettings('22 Days');
      const { lastReportedAt: updatedLastReportedAt, cycle: updatedCycle } = await findOrInsertSettings();

      expect(updatedCycle).to.be.equals('22 Days');
      expect(differenceInDays(updatedLastReportedAt, new Date())).to.be.equals(0);
    });
  });

  it('updates settings with new last reported date if no cycle is given', async () => {
    await ensureReportsTableExists(DEFAULT_CONFIG);

    const newDate = addDays(new Date(), -10);
    await pool.query("INSERT INTO ace_gdpr_settings(cycle, last_reported_at) VALUES('66 Days', $1)", [newDate]);
    const { lastReportedAt, cycle } = await findOrInsertSettings();

    expect(cycle).to.be.equals('66 Days');
    expect(lastReportedAt).to.be.eql(newDate);

    await udpateReportSettings();
    const { lastReportedAt: updatedLastReportedAt, cycle: updatedCycle } = await findOrInsertSettings();

    expect(updatedCycle).to.be.equals('66 Days');
    expect(differenceInDays(updatedLastReportedAt, new Date())).to.be.equals(0);
  });
});
