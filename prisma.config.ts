import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		// Read, not required: `prisma generate` runs without a database.
		url: process.env.DATABASE_URL
	}
});
