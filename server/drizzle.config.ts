// `npm run db:generate` compares src/db/schema.ts with the migrations in
// drizzle/ and writes a new SQL migration for the difference. Commit it.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
