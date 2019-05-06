exports.up = knex => knex.schema.createTable('ace_gdpr_settings', (table) => {
  table
    .increments('id')
    .primary()
    .unsigned();
  table.timestamp('last_reported_at', { useTz: true });
  table.timestamp('updated_at', { useTz: true });
  table.timestamp('created_at', { useTz: true });
  table.string('cycle');
});

exports.down = knex => knex.schema.dropTableIfExists('ace_gdpr_settings');
