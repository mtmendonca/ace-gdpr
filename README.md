# ace-gdpr

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Get GDPR updates for your [Atlas-Connect-Express](https://bitbucket.org/atlassian/atlassian-connect-express/src) application**

This package will assist you in complying with Atlassian's GDPR requirements described [here](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/).

# Installation
Using npm:
```sh
$ npm install --save ace-gdpr
```
# Pre-requisites
- A postgres database.
- atlas-connect-express' AddonSettings table
- This package assumes you're following [jira's recommendation](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/#storing-user-personal-data-for-your-apps) for user data storage and persisting it in a single table.
- The table must have a string column that stores the user account id, a string column that stores the client key for that user, and a date column with when that user's data was last updated.
# Usage
ace-gdpr uses [node-postgres](https://www.npmjs.com/package/pg) to read user data from your database, and to create/update an internal table named `ace_gdpr_settings`.
It assumes the following environment variables to be available with the database connection information:
```sh
PGUSER='database username'
PGPASSWORD='database user password'
PGHOST='database host'
PGPORT='databse port'
PGDATABASE='database name'
```
In your atlas-connect-express application

```js
const getUpdates = require('ace-gdpr').default;

// map your users table name and column names to the config object
const config = {
  databaseConfig: {
    users: {
      tableName: 'users',
      columns: {
        updatedAt: 'updated_at',
        userAccountId: 'user_account_id',
        clientKey: 'client_key'
      }
    }
  },
  forceExecution: false // * see note below
};

getUpdates(config)
  .then(({ updated, closed }) => {
    // use jira api to fetch fresh user data and update the user record. Remember to update the `updatedAt` column for every record
    updated.forEach(accountId => updateUserData(accountId));
    // get rid of this user's personal data wherever you're storing it
    closed.forEach(accountId => removePersistedUserData(accountId));
  })
  .catch((error) => {
    // handle error
  });
```

We recommended running `getUpdates` once a day under a scheduler.
The plugin keeps track of when you last executed successfully in `ace_gdpr_settings` and will only run again one day before the next update cycle recommended by Jira.
Set `forceExecution` to `true` if you want the plugin to ignore the last update and cycle settings in `ace_gdpr_settings` and run the whole thing when called.

# To do
- Create contributing documentation
- Create examples using Kue and node-schedule

# License
MIT
