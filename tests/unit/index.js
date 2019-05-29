/* eslint-disable no-unused-expressions */
import { use, expect } from 'chai';
import request from 'request-promise';
import { addDays } from 'date-fns';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import { createSandbox } from 'sinon';
import * as atlassianJwt from 'atlassian-jwt';
import * as repository from '../../src/repository';
import getUpdates, {
  getDaysFromCycle,
  breakIntoChunks,
  getTokenExpiration,
  getToken,
  shouldSendReport,
  getUserAccountBatches,
  tryPoll,
  poll,
  getClientKeys,
  getClientUpdates,
  compileResult,
  getConfig
} from '../../src';

import { DEFAULT_CONFIG } from '../../src/config';

use(chaiAsPromised);
use(sinonChai);

const sandbox = createSandbox();
const mockConfig = {
  reportAccountsMethod: 'post',
  reportAccountsPath: '/path/to/jira/api/resource',
  logger: console,
  databaseConfig: {
    users: {}
  }
};

describe('index.js', () => {
  describe('getDaysFromCycle', () => {
    it('returns null for empty string input', () => {
      const result = getDaysFromCycle('');
      expect(result).to.be.null;
    });

    it('returns null for null input', () => {
      const result = getDaysFromCycle(null);
      expect(result).to.be.null;
    });

    it('returns null for undefined input', () => {
      const result = getDaysFromCycle();
      expect(result).to.be.null;
    });

    it('returns 25 for 25 Days', () => {
      const result = getDaysFromCycle('25 Days');
      expect(result).to.be.equals(25);
    });
  });

  describe('breakIntoChunks', () => {
    it('returns empty array for empty array input', () => {
      const result = breakIntoChunks([], 10);
      expect(result).to.be.eql([]);
    });

    it('uses chunkSize default value of 90', () => {
      const input = new Array(180).fill();
      const result = breakIntoChunks(input);
      expect(result.length).to.be.equals(2);
      expect(result[0].length).to.be.equals(90);
    });

    it('returns 3 arrays with size 30 for input size 90 and chunkSize 30', () => {
      const input = new Array(90).fill();
      const result = breakIntoChunks(input, 30);
      expect(result.length).to.be.equals(3);
      expect(result[0].length).to.be.equals(30);
    });

    it('returns 3 arrays with size 30, 1 with size 1 for input size 91 and chunkSize 30', () => {
      const input = new Array(91).fill();
      const result = breakIntoChunks(input, 30);
      expect(result.length).to.be.equals(4);
      expect(result[0].length).to.be.equals(30);
      expect(result[3].length).to.be.equals(1);
    });
  });

  describe('getTokenExpiration', () => {
    it('adds 180 seconds to the current date', () => {
      const todayInSeconds = Date.now() / 1000;
      const result = getTokenExpiration(todayInSeconds);
      expect(result).to.be.equals(todayInSeconds + 180);
    });
  });

  describe('getToken', () => {
    const mockedRequest = { method: 'bar' };
    const mockedQueryStringHash = 'mocked-qs-hash';
    const mockedEncodedToken = 'mocked-encoded-token';
    let fromMethodAndUrlStub;
    let createQueryStringHashStub;
    let encodeStub;

    beforeEach(() => {
      fromMethodAndUrlStub = sandbox.stub(atlassianJwt, 'fromMethodAndUrl').returns(mockedRequest);
      createQueryStringHashStub = sandbox.stub(atlassianJwt, 'createQueryStringHash').returns(mockedQueryStringHash);
      encodeStub = sandbox.stub(atlassianJwt, 'encode').returns(mockedEncodedToken);
      sandbox.stub(repository, 'udpateReportSettings').resolves();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('calls getToken, createQueryStringHash and encode with the right parameters', () => {
      const seconds = Date.now() / 1000;
      getToken('my-method', '/my/path', 'my-issuer', 'my-shared-secret');

      expect(fromMethodAndUrlStub).to.have.been.calledWith('my-method', '/my/path');
      expect(createQueryStringHashStub).to.have.been.calledWith(mockedRequest);
      expect(encodeStub).to.have.been.calledWith(
        {
          iss: 'my-issuer',
          iat: seconds,
          exp: seconds + 180,
          qsh: mockedQueryStringHash
        },
        'my-shared-secret'
      );
    });
  });

  describe('shouldSendReport', () => {
    it('returns true if config.forceExecution is true', () => {
      const result = shouldSendReport(
        { cycle: '25 Days', lastReportedAt: new Date() },
        { ...mockConfig, forceExecution: true }
      );
      expect(result).to.be.true;
    });

    it('returns true if cycle and lastReportedAt are null', () => {
      const result = shouldSendReport({ cycle: null, lastReportedAt: null }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns true if cycle and lastReportedAt are undefined', () => {
      const result = shouldSendReport({ cycle: undefined, lastReportedAt: undefined }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns true if cycle and lastReportedAt are empty strings', () => {
      const result = shouldSendReport({ cycle: '', lastReportedAt: '' }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns true if cycle is 2 days and lastReportedAt was yesterday', () => {
      const lastReportedAt = addDays(new Date(), -1);
      const result = shouldSendReport({ cycle: '2 Days', lastReportedAt }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns true if cycle is 10 days and lastReportedAt was 9 days ago', () => {
      const lastReportedAt = addDays(new Date(), -9);
      const result = shouldSendReport({ cycle: '10 Days', lastReportedAt }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns false if cycle is 10 days and lastReportedAt was 8 days ago', () => {
      const lastReportedAt = addDays(new Date(), -8);
      const result = shouldSendReport({ cycle: '10 Days', lastReportedAt }, mockConfig);
      expect(result).to.be.false;
    });

    it('returns true if cycle is 10 days and lastReportedAt was 10 days ago', () => {
      const lastReportedAt = addDays(new Date(), -10);
      const result = shouldSendReport({ cycle: '10 Days', lastReportedAt }, mockConfig);
      expect(result).to.be.true;
    });

    it('returns true if cycle is 10 days and lastReportedAt was 11 days ago', () => {
      const lastReportedAt = addDays(new Date(), -11);
      const result = shouldSendReport({ cycle: '10 Days', lastReportedAt }, mockConfig);
      expect(result).to.be.true;
    });
  });

  describe('getUserAccountBatches', () => {
    const config = { databaseConfig: { users: { foo: 'bar' } } };
    let findUserAccountsStub;

    beforeEach(() => {
      findUserAccountsStub = sandbox
        .stub(repository, 'findUserAccounts')
        .resolves(new Array(190).fill({ accountId: 'foo' }));
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('calls findUserAccounts with the right arguments', async () => {
      await getUserAccountBatches('client-key', config);
      expect(findUserAccountsStub).to.have.been.calledWith('client-key', { foo: 'bar' });
    });

    it('returns an array with 3 entries 90, 90 and 10 item slong', async () => {
      const result = await getUserAccountBatches('client-key', config);
      expect(result[0].length).to.be.equals(90);
      expect(result[1].length).to.be.equals(90);
      expect(result[2].length).to.be.equals(10);
    });
  });

  describe('tryPoll', () => {
    let postStub;

    beforeEach(() => {
      postStub = sandbox.stub(request, 'post');
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('calls request.poll with the right parameters', async () => {
      postStub.returns({ headers: {}, statusCode: 200, body: {} });
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      await tryPoll('post', 'my-url', '/rest/atlassian-connect/latest/report-accounts', 'my-token', userAccounts);
      const { url, headers, json } = postStub.getCalls()[0].args[0];

      expect(url).to.be.equals('my-url/rest/atlassian-connect/latest/report-accounts');
      expect(headers).to.be.eql({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'JWT my-token'
      });
      expect(json).to.be.eql({ accounts: userAccounts });
    });

    it('returns statusCode and data for 200 response', async () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.returns({ headers: { 'cycle-period': '20 Days' }, statusCode: 200, body: { accounts: [] } });
      const { statusCode, data } = await tryPoll(
        'post',
        'my-url',
        '/rest/atlassian-connect/latest/report-accounts',
        'my-token',
        userAccounts
      );

      expect(statusCode).to.be.equals(200);
      expect(data).to.be.eql({ accounts: [], newCyclePeriod: '20 Days' });
    });

    it('returns statusCode and data for 204 response', async () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.resolves({
        headers: { 'cycle-period': '21 Days' },
        statusCode: 204,
        body: { accounts: [{ accountId: 'account-1', status: 'closed' }] }
      });
      const { statusCode, data } = await tryPoll(
        'post',
        'my-url',
        '/rest/atlassian-connect/latest/report-accounts',
        'my-token',
        userAccounts
      );

      expect(statusCode).to.be.equals(204);
      expect(data).to.be.eql({ accounts: [{ accountId: 'account-1', status: 'closed' }], newCyclePeriod: '21 Days' });
    });

    it('returns statusCode and retryAfter if the request fails with http code 429', async () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.throws({ response: { headers: { 'retry-after': 10 } }, statusCode: 429 });
      const { statusCode, retryAfter } = await tryPoll(
        'post',
        'my-url',
        '/rest/atlassian-connect/latest/report-accounts',
        'my-token',
        userAccounts
      );
      expect(statusCode).to.equals(429);
      expect(retryAfter).to.equals(10);
    });

    it('throws if the request fails with 500', () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.throws({ response: { headers: { 'retry-after': 10 } }, statusCode: 500 });
      return expect(
        tryPoll('post', 'my-url', '/rest/atlassian-connect/latest/report-accounts', 'my-token', userAccounts)
      ).to.eventually.be.rejected;
    });

    it('throws if the request fails with 404', async () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.throws({ response: { headers: { 'retry-after': 10 } }, statusCode: 404 });
      return expect(
        tryPoll('post', 'my-url', '/rest/atlassian-connect/latest/report-accounts', 'my-token', userAccounts)
      ).to.eventually.be.rejected;
    });

    it('throws if the request fails with 401', async () => {
      const userAccounts = [
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' },
        { accountId: 'foo', udpatedAt: new Date(), clientKey: 'bar' }
      ];

      postStub.throws({ response: { headers: { 'retry-after': 10 } }, statusCode: 401 });
      return expect(
        tryPoll('post', 'my-url', '/rest/atlassian-connect/latest/report-accounts', 'my-token', userAccounts)
      ).to.eventually.be.rejected;
    });
  });

  describe('poll', () => {
    let postStub;
    let getStub;

    beforeEach(() => {
      sandbox.stub(repository, 'findClientInfo').resolves({ clientKey: 'client-key-1', url: 'client-url' });
      sandbox.stub(atlassianJwt, 'fromMethodAndUrl').returns({});
      sandbox.stub(atlassianJwt, 'createQueryStringHash').returns('my-qsh');
      sandbox.stub(atlassianJwt, 'encode').returns('my-token');
      getStub = sandbox.stub(request, 'get').resolves({ statusCode: 200, headers: {}, body: {} });
      postStub = sandbox
        .stub(request, 'post')
        .onFirstCall()
        .rejects({ statusCode: 429, response: { headers: { 'retry-after': 1 } } })
        .onSecondCall()
        .resolves({ statusCode: 200, headers: {}, body: {} });
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('calls jira api 2x if the first call returns a retry-after header and status code 429', async () => {
      await poll([], 'client-key', mockConfig);
      expect(postStub.getCalls().length).to.be.equals(2);
    });

    it('calls jira api 1x if the first call returns 200', async () => {
      postStub.reset();
      postStub.resolves({ statusCode: 200, headers: {}, body: {} });
      await poll([], 'client-key', mockConfig);
      expect(postStub.getCalls().length).to.be.equals(1);
    });

    it('calls jira api 1x if the first call returns 204', async () => {
      postStub.reset();
      postStub.resolves({ statusCode: 204, headers: {}, body: {} });
      await poll([], 'client-key', mockConfig);
      expect(postStub.getCalls().length).to.be.equals(1);
    });

    it('returns an empty array if api call returns 204 and undefined body', async () => {
      postStub.reset();
      postStub.resolves({ statusCode: 204, headers: {}, body: undefined });
      const result = await poll([], 'client-key', mockConfig);
      expect(result).to.be.eql({ accounts: [] });
    });

    it('returns an empty array if api call returns 204 and empty object body', async () => {
      postStub.reset();
      postStub.resolves({ statusCode: 204, headers: {}, body: {} });
      const result = await poll([], 'client-key', mockConfig);
      expect(result).to.be.eql({ accounts: [] });
    });

    it('throws jira api rejects with 400', async () => {
      postStub.reset();
      postStub.rejects({ statusCode: 400, headers: {}, body: {} });
      return expect(poll([], 'client-key', mockConfig)).to.eventually.be.rejected;
    });

    it('throws jira api rejects with 500', async () => {
      postStub.reset();
      postStub.rejects({ statusCode: 500, headers: {}, body: {} });
      return expect(poll([], 'client-key', mockConfig)).to.eventually.be.rejected;
    });

    it('calls jira api with provided path and method', async () => {
      postStub.reset();
      postStub.resolves(true);
      getStub.reset();
      getStub.resolves(true);

      await poll([], 'client-key', { reportAccountsMethod: 'post', reportAccountsPath: '/path/to/post/resource' });
      await poll([], 'client-key', { reportAccountsMethod: 'get', reportAccountsPath: '/path/to/get/resource' });

      expect(postStub).to.have.been.calledWithMatch({ url: 'client-url/path/to/post/resource' }).and.to.have.been
        .calledOnce;
      expect(getStub).to.have.been.calledWithMatch({ url: 'client-url/path/to/get/resource' }).and.to.have.been
        .calledOnce;
    });
  });

  describe('getClientKeys', () => {
    let findClientKeysStub;

    beforeEach(() => {
      findClientKeysStub = sandbox
        .stub(repository, 'findClientKeys')
        .resolves([{ clientKey: 'foo' }, { clientKey: 'bar' }, { clientKey: '' }, { clientKey: null }, {}]);
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('calls findClientKeys', async () => {
      await getClientKeys(mockConfig);
      expect(findClientKeysStub).to.have.been.calledOnce;
    });

    it('filters results with empty clientKeys', async () => {
      const result = await getClientKeys(mockConfig);
      expect(result.length).to.be.equals(2);
    });
  });

  describe('getClientUpdates', () => {
    const today = new Date();
    let postSub;

    beforeEach(() => {
      sandbox.stub(repository, 'findUserAccounts').resolves([
        {
          accountId: 'acount-1',
          udpatedAt: today,
          clientKey: 'client-key-1'
        },
        {
          accountId: 'acount-2',
          udpatedAt: today,
          clientKey: 'client-key-1'
        }
      ]);
      sandbox.stub(repository, 'findClientInfo').resolves({
        secret: 'my-secret',
        url: 'my-url',
        key: 'my-key'
      });
      sandbox.stub(atlassianJwt, 'fromMethodAndUrl').returns({});
      sandbox.stub(atlassianJwt, 'createQueryStringHash').returns('query-string-hash');
      sandbox.stub(atlassianJwt, 'encode').returns('my-token');
      postSub = sandbox.stub(request, 'post').resolves({
        statusCode: 200,
        headers: { 'cycle-period': '25 Days' },
        body: {
          accounts: [{ accountId: 'account-1', status: 'updated' }, { accountId: 'account-2', status: 'closed' }]
        }
      });
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('polls jira api with provided account ids', async () => {
      await getClientUpdates('client-key', mockConfig);
      expect(postSub.getCalls()[0].args[0].json).to.be.eql({
        accounts: [
          { accountId: 'acount-1', udpatedAt: today, clientKey: 'client-key-1' },
          { accountId: 'acount-2', udpatedAt: today, clientKey: 'client-key-1' }
        ]
      });
    });

    it('returns statuses and new cycle', async () => {
      const result = await getClientUpdates('client-key', mockConfig);
      expect(result).to.be.eql({
        statuses: [{ accountId: 'account-1', status: 'updated' }, { accountId: 'account-2', status: 'closed' }],
        cycle: '25 Days'
      });
    });
  });

  describe('compileResult', () => {
    it('groups account ids by updated, closed and grabs cycle', () => {
      const result = compileResult([
        {
          statuses: [{ accountId: 'account-1', status: 'updated' }, { accountId: 'account-2', status: 'closed' }],
          cycle: '25 Days'
        },
        {
          statuses: [{ accountId: 'account-3', status: 'updated' }, { accountId: 'account-4', status: 'closed' }],
          cycle: '25 Days'
        }
      ]);

      expect(result).to.be.eql({
        updated: ['account-1', 'account-3'],
        closed: ['account-2', 'account-4'],
        cycle: '25 Days'
      });
    });
  });

  describe('getConfig', () => {
    it('returns default config if empty object is given', () => {
      const config = getConfig({});
      expect(config).to.be.eql(DEFAULT_CONFIG);
    });

    it('returns default config if no parameter is given', () => {
      const config = getConfig();
      expect(config).to.be.eql(DEFAULT_CONFIG);
    });

    it('overrides all default values', () => {
      const userConfig = {
        logger: () => {},
        reportAccountsMethod: 'custom-method',
        reportAccountsPath: 'custom-path',
        databaseConfig: {
          connection: {
            host: 'custom-host',
            user: 'custom-user',
            password: 'custom-passwd',
            port: 'custom-port',
            database: 'custom-database'
          },
          users: {
            tableName: 'custom-users-table',
            columns: {
              updatedAt: 'custom-updated-at',
              userAccountId: 'custom-user-account-id',
              clientKey: 'custom-client-key'
            }
          }
        },
        forceExecution: true
      };

      const config = getConfig(userConfig);

      expect(config).to.be.eql(userConfig);
    });
  });

  describe('getUpdates', () => {
    let postStub;
    let ensureReportsTableExistsStub;
    let findOrInsertSettingsStub;
    let findClientKeysStub;
    let udpateReportSettingsStub;
    const now = new Date();

    beforeEach(() => {
      postStub = sandbox.stub(request, 'post').resolves({
        statusCode: 200,
        headers: { 'cycle-period': '25 Days' },
        body: {
          accounts: [{ accountId: 'account-1', status: 'updated' }, { accountId: 'account-2', status: 'closed' }]
        }
      });
      ensureReportsTableExistsStub = sandbox.stub(repository, 'ensureReportsTableExists');
      findOrInsertSettingsStub = sandbox.stub(repository, 'findOrInsertSettings').resolves([
        {
          accountId: 'acount-1',
          udpatedAt: now,
          clientKey: 'client-key-1'
        },
        {
          accountId: 'acount-2',
          udpatedAt: now,
          clientKey: 'client-key-1'
        }
      ]);
      findClientKeysStub = sandbox.stub(repository, 'findClientKeys');
      udpateReportSettingsStub = sandbox.stub(repository, 'udpateReportSettings').resolves();
      sandbox.stub(repository, 'findUserAccounts').resolves([
        {
          accountId: 'acount-1',
          udpatedAt: now
        },
        {
          accountId: 'acount-2',
          udpatedAt: now
        }
      ]);
      sandbox.stub(repository, 'findClientInfo').resolves({
        secret: 'my-secret',
        url: 'my-url',
        key: 'my-key'
      });
      sandbox.stub(atlassianJwt, 'fromMethodAndUrl').returns({});
      sandbox.stub(atlassianJwt, 'createQueryStringHash').returns('query-string-hash');
      sandbox.stub(atlassianJwt, 'encode').returns('my-token');
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('throws if ensureReportsTableExists throws', () => {
      ensureReportsTableExistsStub.throws();

      return expect(getUpdates({})).to.eventually.be.rejected;
    });

    it('throws if findOrInsertSettings throws', () => {
      ensureReportsTableExistsStub.resolves();
      findOrInsertSettingsStub.throws();

      return expect(getUpdates({})).to.eventually.be.rejected;
    });

    it('does not get client keys if shouldSendReport returns false', async () => {
      ensureReportsTableExistsStub.resolves();
      findOrInsertSettingsStub.resolves({ cycle: '25 Days', lastReportedAt: new Date() });

      await getUpdates({});
      expect(findClientKeysStub).not.to.have.been.called;
    });

    it('polls jira api with provided account ids', async () => {
      ensureReportsTableExistsStub.resolves();
      findOrInsertSettingsStub.resolves({ cycle: '2 Days', lastReportedAt: addDays(new Date(), -1) });
      findClientKeysStub.resolves([{ clientKey: 'client-key' }]);

      const updates = await getUpdates();

      expect(postStub.getCalls()[0].args[0].json).to.be.eql({
        accounts: [
          {
            accountId: 'acount-1',
            udpatedAt: now
          },
          {
            accountId: 'acount-2',
            udpatedAt: now
          }
        ]
      });
      expect(updates).to.be.eql({ updated: ['account-1'], closed: ['account-2'], cycle: '25 Days' });
    });

    it('calls udpateReportSettings once', async () => {
      ensureReportsTableExistsStub.resolves();
      findOrInsertSettingsStub.resolves({ cycle: '2 Days', lastReportedAt: addDays(new Date(), -1) });
      findClientKeysStub.resolves([{ clientKey: 'client-key' }]);

      await getUpdates();

      expect(udpateReportSettingsStub).to.have.been.calledOnce;
    });
  });
});
