import 'dotenv/config';

export default {
  schema: './src/store/schema.js',
  out: './src/store/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/assay',
  },
};
