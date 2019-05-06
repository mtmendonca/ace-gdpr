process.env.DB_DIALECT = process.env.DB_DIALECT || 'postgresql';
process.env.PGUSER = process.env.PGUSER || 'postgres';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'passwd';
process.env.PGHOST = process.env.PGHOST || 'localhost';
process.env.PGPORT = process.env.PGPORT || '5432';
process.env.PGDATABASE = process.env.PGDATABASE || 'postgres';

const {
  PGHOST, PGUSER, PGPASSWORD, PGPORT, PGDATABASE
} = process.env;

process.env.DATABASE_URL = process.env.DATABASE_URL || `postgres://${PGHOST}:${PGUSER}@${PGPASSWORD}:${PGPORT}/${PGDATABASE}`;
