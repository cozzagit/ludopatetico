import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { users } from '../src/lib/db/schema';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

async function seedAdmin() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/football_oracle';
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  const hashedPassword = await bcrypt.hash('Admin2026!', 12);

  await db.insert(users).values({
    username: 'admin',
    email: 'luca.cozza@gmail.com',
    password: hashedPassword,
    firstName: 'Luca',
    lastName: 'Cozza',
    isPremium: true,
    isAdmin: true,
  }).onConflictDoNothing();

  console.log('Admin user seeded successfully');
  await pool.end();
}

seedAdmin().catch(console.error);
