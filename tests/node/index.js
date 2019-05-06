/* eslint-disable */

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
  .catch((error) => {
    console.log(error);
  });
