import { neon } from '@neondatabase/serverless';
import { ensureSchedulerStarted } from '@/lib/scheduler/bootstrap';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = neon(process.env.DATABASE_URL);

// Start the auto-publish scheduler on first DB import (server-side only)
ensureSchedulerStarted();
