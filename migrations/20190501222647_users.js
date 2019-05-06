exports.up = knex => knex.schema.createTable('users', (table) => {
  table
    .increments('id')
    .primary()
    .unsigned();
  table.timestamp('updated_at', { useTz: true });
  table.timestamp('created_at', { useTz: true });
  table.string('user_account_id');
  table.string('client_key');
});
exports.down = knex => knex.schema.dropTableIfExists('users');
