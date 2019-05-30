// @flow
/* eslint-disable no-await-in-loop */
import 'regenerator-runtime/runtime';
import request from 'request-promise';
import delay from 'delay';
import { differenceInDays } from 'date-fns';
import { encode, createQueryStringHash, fromMethodAndUrl } from 'atlassian-jwt';
import defaultsDeep from 'lodash.defaultsdeep';
import type {
  Config,
  ReportSettings,
  TokenData,
  UserAccount,
  Set,
  PollResult,
  JiraPollResponse,
  ClientUpdates,
  CompiledResults,
  JiraPollError
} from './types';
import {
  ensureReportsTableExists,
  findOrInsertSettings,
  findClientKeys,
  findUserAccounts,
  findClientInfo,
  udpateReportSettings
} from './repository';

import {
  DEFAULT_CONFIG, RETRY, UNAUTHORIZED, FORBIDDEN
} from './config';

export function getDaysFromCycle(cycle: string): ?number {
  if (typeof cycle === 'string') {
    const matchedDays = cycle.match(/[\d]+/gi);
    if (matchedDays && matchedDays.length > 0) {
      return parseInt(matchedDays[0], 10);
    }
  }
  return null;
}

export function breakIntoChunks<T>(input: Array<?T>, chunkSize: number = 90): Array<?Array<?T>> {
  const chunks = [];
  for (let index = 0; index < input.length; index += chunkSize) {
    chunks.push(input.slice(index, index + chunkSize));
  }
  return chunks;
}

export function getTokenExpiration(issuedAt: number): number {
  return issuedAt + 180;
}

export function getToken(method: string, path: string, issuer: string, sharedSecret: string): string {
  const iat: number = Date.now() / 1000;
  const exp = getTokenExpiration(iat);

  const req = fromMethodAndUrl(method, path);
  const tokenData: TokenData = {
    iss: issuer,
    iat,
    exp,
    qsh: createQueryStringHash(req)
  };

  const token: string = encode(tokenData, sharedSecret);
  return token;
}

export function shouldSendReport(
  { cycle, lastReportedAt }: ReportSettings,
  { logger, forceExecution }: Config
): boolean {
  if (forceExecution) {
    return true;
  }
  // if it's the first time running, ignore cycle and last reported date
  if (!cycle && !lastReportedAt) {
    return true;
  }

  if (cycle && lastReportedAt) {
    const today = new Date();
    today.setHours(0, 0, 0);
    lastReportedAt.setHours(0, 0, 0);

    const daysFromCycle = getDaysFromCycle(cycle);
    if (daysFromCycle) {
      // send the report one day before cycle recommendation to allow for error handling
      const difference: number = differenceInDays(today, lastReportedAt);
      return daysFromCycle - difference <= 1;
    }
  }

  logger.log('Either cycle or lastReportedAt is missing: ', { cycle, lastReportedAt });
  return false;
}

// return [[]] where each child array has up to 90 elements
export async function getUserAccountBatches(clientKey: string, config: Config): Promise<Array<?Array<?UserAccount>>> {
  const userAccounts = await findUserAccounts(clientKey, config.databaseConfig.users);
  return breakIntoChunks(userAccounts, 90);
}

export async function tryPoll(
  reportAccountsMethod: string,
  clientJiraInstanceEndpoint: string,
  reportAccountsPath: string,
  token: string,
  userAccounts: Array<?UserAccount>
): Promise<PollResult> {
  try {
    const { statusCode, body, headers }: { statusCode: number, headers: Set<string>, body: Object } = await request[
      reportAccountsMethod
    ]({
      url: `${clientJiraInstanceEndpoint}${reportAccountsPath}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `JWT ${token}`
      },
      json: {
        accounts: userAccounts
      },
      resolveWithFullResponse: true
    });

    return {
      statusCode,
      data:
        body && body.accounts
          ? Object.assign(body || {}, { newCyclePeriod: headers['cycle-period'] })
          : { accounts: [] }
    };
  } catch (error) {
    const {
      statusCode,
      response: { headers }
    }: JiraPollError = error;

    if (statusCode === RETRY) {
      return { statusCode, retryAfter: parseInt(headers['retry-after'], 10), data: { accounts: [] } };
    }

    throw error;
  }
}

export async function poll(
  userAccounts: Array<?UserAccount>,
  clientKey: string,
  { reportAccountsMethod, reportAccountsPath }: Config
): Promise<?JiraPollResponse> {
  let responseData;
  const clientInfo = await findClientInfo(clientKey);

  if (clientInfo) {
    const { secret, url: clientJiraInstanceEndpoint, key: issuer } = clientInfo;

    const token = getToken(reportAccountsMethod, reportAccountsPath, issuer, secret);

    do {
      const result = await tryPoll(
        reportAccountsMethod,
        clientJiraInstanceEndpoint,
        reportAccountsPath,
        token,
        userAccounts
      );

      if (result) {
        const { data, statusCode, retryAfter } = result;
        responseData = data;
        if (statusCode === RETRY && retryAfter) {
          responseData = null;
          await delay(retryAfter * 1000);
        }
      }
    } while (responseData === null);
  }

  return responseData;
}

export async function getClientKeys(config: Config): Promise<Array<?string>> {
  const result = await findClientKeys(config.databaseConfig.users);
  const clientKeyList = result.map(row => row && row.clientKey).filter(n => !!n);
  return clientKeyList;
}

export async function getClientUpdates(clientKey: string, config: Config): Promise<ClientUpdates> {
  let statuses = [];
  let cycle = '';

  const userAccountBatches = await getUserAccountBatches(clientKey, config);
  for (let n = 0; n <= userAccountBatches.length; n += 1) {
    const batch = userAccountBatches[n];
    if (batch) {
      const result = await poll(batch, clientKey, config);
      if (result) {
        const newCycle = result.newCyclePeriod || '';
        const accounts = result.accounts || [];
        statuses = [...statuses, ...accounts];
        if (!cycle && newCycle) {
          cycle = newCycle;
        }
      }
    }
  }

  return { statuses, cycle };
}

export function compileResult(clientUpdates: Array<ClientUpdates>): CompiledResults {
  return clientUpdates.reduce(
    (agg, { statuses, cycle }) => {
      const { updated, closed } = agg;

      const currentUpdated = statuses.filter(({ status }) => status === 'updated').map(({ accountId }) => accountId);

      const currentClosed = statuses.filter(({ status }) => status === 'closed').map(({ accountId }) => accountId);

      return {
        updated: [...updated, ...currentUpdated],
        closed: [...closed, ...currentClosed],
        cycle
      };
    },
    { updated: [], closed: [], cycle: null }
  );
}

export function getConfig(userConfig: Object): Config {
  return defaultsDeep(userConfig, DEFAULT_CONFIG);
}

export default async function getUpdates(userConfig: ?Object = {}): Promise<CompiledResults> {
  const config = getConfig(userConfig);

  await ensureReportsTableExists(config);

  const { logger } = config;
  const clientResults = [];

  const settings = await findOrInsertSettings();

  const { cycle, lastReportedAt } = settings;

  if (shouldSendReport({ cycle, lastReportedAt }, config)) {
    logger.log('Found report settings: ', settings);
    const clientKeys = await getClientKeys(config);

    for (let n = 0; n < clientKeys.length; n += 1) {
      const clientKey = clientKeys[n];
      if (clientKey) {
        try {
          logger.log(`Getting user account info for client: ${clientKey}`);
          const clientAccounts = await getClientUpdates(clientKey, config);
          clientResults.push(clientAccounts);
        } catch (error) {
          if (error.statusCode === UNAUTHORIZED || error.statusCode === FORBIDDEN) {
            config.logger.warn(
              `Unable to poll updates for client ${clientKey} due to authorization issues (${error.statusCode}).`
            );
          } else {
            throw error;
          }
        }
      }
    }
  }

  const result = compileResult(clientResults);

  await udpateReportSettings(result.cycle);

  return result;
}
