// src/config/database.js

const { Pool } = require('pg');

// Create a new pool instance using environment variables or default values
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'school_db',
  password: 'newpassword',
  port: 5432,
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to PostgreSQL database successfully!');
  release();
});

// Export the query method for use in our application
module.exports = {
  query: (text, params) => pool.query(text, params),
};