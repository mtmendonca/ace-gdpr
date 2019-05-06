exports.up = (knex, Promise) => Promise.all([
  knex('ace_gdpr_settings').insert([
    {
      last_reported_at: new Date(),
      updated_at: new Date(),
      created_at: new Date(),
      cycle: '1 Days'
    }
  ]),
  knex('AddonSettings').insert([
    {
      id: '1',
      clientKey: process.env.CLIENT_KEY_1,
      key: 'clientInfo',
      val: {
        key: process.env.CLIENT_INFO_KEY_1,
        clientKey: process.env.CLIENT_KEY_1,
        sharedSecret: process.env.CLIENT_INFO_SHARED_SECRET_1,
        baseUrl: process.env.CLIENT_INFO_BASE_URL_1
      }
    },
    {
      id: '2',
      clientKey: process.env.CLIENT_KEY_2,
      key: 'clientInfo',
      val: {
        key: process.env.CLIENT_INFO_KEY_2,
        clientKey: process.env.CLIENT_KEY_2,
        sharedSecret: process.env.CLIENT_INFO_SHARED_SECRET_2,
        baseUrl: process.env.CLIENT_INFO_BASE_URL_2
      }
    }
  ]),
  knex('users').insert([
    {
      user_account_id: '5be24ad8b1653240376955d2',
      client_key: process.env.CLIENT_KEY_1,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      user_account_id: '5be24ba3f91c106033269289',
      client_key: process.env.CLIENT_KEY_1,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      user_account_id: '5be24ad8b1653240376955d2',
      client_key: process.env.CLIENT_KEY_2,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      user_account_id: '5be24ba3f91c106033269289',
      client_key: process.env.CLIENT_KEY_2,
      created_at: new Date(),
      updated_at: new Date()
    }
  ])
]);

exports.down = () => true;
