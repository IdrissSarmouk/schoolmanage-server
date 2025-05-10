// src/config/db-init.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Use environment variables for database connection in production
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'school_db',
  password: 'newpassword',
  port: 5432,
});

// SQL for creating tables
const createTablesSql = `
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" SERIAL PRIMARY KEY,
  "phone_number" varchar UNIQUE NOT NULL,
  "email" varchar UNIQUE NOT NULL,
  "password_hash" varchar NOT NULL,
  "pin_hash" varchar,
  "full_name" varchar,
  "account_type" varchar NOT NULL CHECK (account_type IN ('personal', 'merchant')),
  "merchant_subtype" varchar CHECK (merchant_subtype IN ('admin', 'employee', NULL)),
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp,
  "last_login" timestamp,
  "account_status" varchar NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated'))
);

CREATE TABLE IF NOT EXISTS "personal_profiles" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "full_name" varchar NOT NULL,
  "id_card_number" varchar NOT NULL,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "merchant_profiles" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer UNIQUE NOT NULL,
  "company_name" varchar NOT NULL,
  "full_name" varchar NOT NULL,
  "rc_code" varchar NOT NULL,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "merchant_employees" (
  "id" SERIAL PRIMARY KEY,
  "merchant_profile_id" integer NOT NULL,
  "employee_account_id" integer NOT NULL,
  "permissions" json,
  "added_at" timestamp NOT NULL,
  FOREIGN KEY ("merchant_profile_id") REFERENCES "merchant_profiles" ("id"),
  FOREIGN KEY ("employee_account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "refresh_token" varchar NOT NULL,
  "created_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  "device_id" varchar NOT NULL,
  "is_revoked" boolean NOT NULL DEFAULT false,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "cards" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "card_number" varchar NOT NULL,
  "account_number" varchar NOT NULL,
  "cvv" varchar NOT NULL,
  "expiry_date" varchar NOT NULL,
  "full_name" varchar NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "card_type" varchar,
  "last_four" varchar NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" SERIAL PRIMARY KEY,
  "amount" decimal NOT NULL,
  "currency" varchar NOT NULL DEFAULT 'USD',
  "status" varchar NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  "sender_id" integer NOT NULL,
  "recipient_id" integer NOT NULL,
  "card_id" integer,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp,
  FOREIGN KEY ("sender_id") REFERENCES "accounts" ("id"),
  FOREIGN KEY ("recipient_id") REFERENCES "accounts" ("id"),
  FOREIGN KEY ("card_id") REFERENCES "cards" ("id")
);

CREATE TABLE IF NOT EXISTS "connected_devices" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "device_name" varchar NOT NULL,
  "device_id" varchar UNIQUE NOT NULL,
  "device_type" varchar NOT NULL,
  "os_details" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  "first_connected_at" timestamp NOT NULL,
  "last_activity_at" timestamp NOT NULL,
  "ip_address" varchar NOT NULL,
  "location" varchar,
  "is_current" boolean NOT NULL DEFAULT false,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "pin_history" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "pin_hash" varchar NOT NULL,
  "created_at" timestamp NOT NULL,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" SERIAL PRIMARY KEY,
  "account_id" integer NOT NULL,
  "title" varchar NOT NULL,
  "message" text NOT NULL,
  "type" varchar NOT NULL CHECK (type IN ('transaction', 'security', 'system', 'promotion')),
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL,
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id")
);
`;

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('Starting database initialization...');
    await client.query('BEGIN');
    await client.query(createTablesSql);
    await client.query('COMMIT');
    console.log('Database initialized successfully!');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeDatabase
};