/* eslint-disable */

process.env.DATABASE_URL = 'postgres://postgres:passwd@localhost:5432/postgres';
process.env.DB_DIALECT = 'postgresql';
process.env.PGHOST = 'localhost';
process.env.PGUSER = 'postgres';
process.env.PGDATABASE = 'postgres';
process.env.PGPASSWORD = 'passwd';
process.env.PGPORT = 5432;

const getUpdates = require('../../lib/index').default;

// map your users table name and column names to the config object
const config = {
  databaseConfig: {
    users: {
      tableName: 'Gdpr',
      columns: {
        updatedAt: 'updatedAt',
        userAccountId: 'userAccountId',
        clientKey: 'clientKey'
      }
    }
  }
};

getUpdates(config)
  .then(({ updated, closed }) => {
    console.log(updated);
    console.log(closed);
  })
  .catch(error => {
    console.log(error);
  });
