require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

async function enablePgVector() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled successfully');
    
  } catch (error) {
    console.error('Error enabling pgvector:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

enablePgVector();
