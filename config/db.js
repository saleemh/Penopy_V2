// config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: 'saleemh',
  host: 'localhost',
  database: 'collabdraw_db',
  password: 'M3richandni',
  port: 5432,
});

module.exports = pool;