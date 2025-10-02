import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

// Option 1: Using connection string (ensure special chars are URL-encoded)
export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});



pool.connect()
  .then(() => console.log("PostgreSQL connected"))
  .catch(err => console.error("PostgreSQL connection error:", err));
