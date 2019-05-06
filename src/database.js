import { Pool } from 'pg';

const pool = new Pool();

pool.on('error', (err) => {
  throw err;
});

export default pool;
