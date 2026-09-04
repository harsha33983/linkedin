/**
 * Cron-Based Auto-Publish Scheduler
 *
 * Runs as a background loop inside the Next.js process (no Redis/BullMQ needed).
 * Checks every 60 seconds for users with active schedules whose posting time has arrived.
 *
 * Flow per tick:
 * 1. Find all non-paused publish_schedules where mode != 'manual'
 * 2. For each schedule, check if current time matches postingTime in the user's timezone
 * 3. Check daily limit (maxPerDay) — count posts already published today
 * 4. Pick the next READY post from the queue (ordered by queuePosition)
 * 5. Acquire idempotency lock (publishLockId) — only one worker processes the job
 * 6. Call publishTextPost from LinkedIn publishing service
 * 7. Update post status, record audit log
 *
 * Uses a simple setInterval — for production with multiple instances, add a
 * distributed lock (e.g. Neon advisory locks or Redis) to prevent duplicate processing.
 */

import { sql } from "@/lib/db";
import { publishTextPost } from "@/lib/linkedin/publishing";

const TICK_INTERVAL_MS = 60_000; // Check every 60 seconds
const LOCK_PREFIX = "scheduler_";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false; // In-memory guard to prevent overlapping ticks

interface ScheduleRow {
  id: string;
  userId: string;
  mode: string;
  postingTime: string; // "HH:MM"
  postingTimezone: string;
  postingDays: number[]; // [0=Sun, 1=Mon, ..., 6=Sat]
  maxPerDay: number;
  isPaused: boolean;
  linkedinAccountId: string | null;
}

interface PostRow {
  id: string;
  content: string;
  imageUrl: string | null;
  queuePosition: number | null;
}

/**
 * Start the scheduler. Safe to call multiple times — only one interval runs.
 */
export function startScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running, skipping start");
    return;
  }

  console.log("[Scheduler] Starting cron-based auto-publish scheduler (tick every 60s)");

  // Run immediately on start, then every 60s
  runSchedulerTick().catch((err) => {
    console.error("[Scheduler] Initial tick failed:", err);
  });

  schedulerInterval = setInterval(() => {
    runSchedulerTick().catch((err) => {
      console.error("[Scheduler] Tick failed:", err);
    });
  }, TICK_INTERVAL_MS);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
}

/**
 * Single scheduler tick — processes all eligible schedules.
 */
async function runSchedulerTick(): Promise<void> {
  if (isProcessing) {
    console.log("[Scheduler] Previous tick still running, skipping");
    return;
  }

  isProcessing = true;
  const startTime = Date.now();

  try {
    let totalPublished = 0;

    // 1. Recurring auto-publish schedules (publish next READY queue item at posting time)
    const schedules = await sql`
      SELECT * FROM publish_schedules
      WHERE "isPaused" = false AND mode != 'manual'
    `;

    if (schedules.length > 0) {
      console.log(`[Scheduler] Checking ${schedules.length} active schedule(s)`);
      for (const schedule of schedules) {
        try {
          const published = await processSchedule(schedule as ScheduleRow);
          totalPublished += published;
        } catch (err) {
          console.error(`[Scheduler] Error processing schedule ${schedule.id}:`, err);
        }
      }
    }

    // 2. One-off posts scheduled for a specific time (status SCHEDULED + scheduledAt)
    totalPublished += await processDueScheduledPosts();

    const elapsed = Date.now() - startTime;
    if (totalPublished > 0) {
      console.log(`[Scheduler] Tick complete: published ${totalPublished} post(s) in ${elapsed}ms`);
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Publish one-off posts whose scheduled time has arrived.
 *
 * These are posts the user scheduled individually (queue / calendar):
 * status = 'SCHEDULED' with a concrete scheduledAt. The recurring
 * schedule flow above only handles auto-publish schedules, so without
 * this pass individually scheduled posts would never fire.
 *
 * `scheduledAt` is the canonical trigger time (what the UI sets);
 * `scheduledAtUTC` is treated as a fallback for legacy rows.
 */
async function processDueScheduledPosts(): Promise<number> {
  // IMPORTANT: posts.scheduledAt/scheduledAtUTC are stored as naive UTC
  // wall-clock timestamps (`timestamp without time zone`). Neon's pooler
  // assigns per-connection session timezones (UTC vs Asia/Kolkata), so a
  // plain column read or `col <= now()` can shift the instant by the session
  // offset and fire posts early/late. Forcing `AT TIME ZONE 'UTC'` makes the
  // comparison deterministic regardless of the session timezone.
  const duePosts = await sql`
    SELECT id, content, "imageUrl", "userId", "scheduledAt", "scheduledAtUTC", "scheduledTimezone"
    FROM posts
    WHERE status = 'SCHEDULED'
      AND ("publishLockId" IS NULL OR "publishLockId" = '')
      AND COALESCE("scheduledAt", "scheduledAtUTC") IS NOT NULL
      AND (COALESCE("scheduledAt", "scheduledAtUTC") AT TIME ZONE 'UTC') <= now()
  `;

  let published = 0;

  for (const raw of duePosts) {
    const post = raw as {
      id: string;
      content: string;
      imageUrl: string | null;
      userId: string;
      scheduledAt: Date | null;
      scheduledAtUTC: Date | null;
      scheduledTimezone: string | null;
    };

    const lockId = `${LOCK_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const locked = await acquireLock(post.id, lockId);
      if (!locked) {
        console.log(`[Scheduler] Could not acquire lock for scheduled post ${post.id} — skipping`);
        continue;
      }

      console.log(`[Scheduler] One-off scheduled post ${post.id} is due — publishing for user ${post.userId}...`);
      const result = await publishTextPost({
        postId: post.id,
        userId: post.userId,
        content: post.content,
        imageUrl: post.imageUrl || undefined,
      });

      if (result.success) {
        console.log(`[Scheduler] ✓ Scheduled post ${post.id} published → ${result.externalPostId}`);
        published += 1;
      } else {
        console.error(`[Scheduler] ✗ Scheduled post ${post.id} failed: ${result.error} (${result.errorType})`);
        // publishTextPost already set status FAILED + cleared the lock.
      }
    } catch (err) {
      console.error(`[Scheduler] Unexpected error publishing scheduled post ${post.id}:`, err);
      await releaseLock(post.id, lockId).catch(() => undefined);
    }
  }

  return published;
}

/**
 * Process a single user's schedule.
 * Returns the number of posts published.
 */
async function processSchedule(schedule: ScheduleRow): Promise<number> {
  const now = new Date();

  // 2. Check if it's posting time for this user
  if (!isPostingTime(schedule, now)) {
    return 0;
  }

  console.log(`[Scheduler] Schedule ${schedule.id} — posting time reached for user ${schedule.userId}`);

  // 3. Check daily limit
  const todayCount = await getPublishedCountToday(schedule.userId);
  if (todayCount >= schedule.maxPerDay) {
    console.log(`[Scheduler] User ${schedule.userId} already hit daily limit (${todayCount}/${schedule.maxPerDay})`);
    return 0;
  }

  // 4. Pick next READY post from queue
  const post = await getNextReadyPost(schedule.userId);
  if (!post) {
    console.log(`[Scheduler] No READY posts in queue for user ${schedule.userId}`);
    return 0;
  }

  // 5. Acquire idempotency lock
  const lockId = `${LOCK_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const locked = await acquireLock(post.id, lockId);
  if (!locked) {
    console.log(`[Scheduler] Could not acquire lock for post ${post.id} — another worker may be processing it`);
    return 0;
  }

  console.log(`[Scheduler] Publishing post ${post.id} for user ${schedule.userId}...`);

  // 6. Publish to LinkedIn
  try {
    const result = await publishTextPost({
      postId: post.id,
      userId: schedule.userId,
      socialAccountId: schedule.linkedinAccountId || undefined,
      content: post.content,
      imageUrl: post.imageUrl || undefined,
      // No request context in scheduler — audit logs use 'scheduler' as publishedBy
    });

    if (result.success) {
      console.log(`[Scheduler] ✓ Post ${post.id} published → ${result.externalPostId}`);
      return 1;
    } else {
      console.error(`[Scheduler] ✗ Post ${post.id} failed: ${result.error} (${result.errorType})`);

      // If auth expired, pause the schedule
      if (result.errorType === "AUTH_EXPIRED") {
        await sql`
          UPDATE publish_schedules SET "isPaused" = true, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${schedule.id}
        `;
        console.log(`[Scheduler] Paused schedule ${schedule.id} — LinkedIn connection expired`);
      }

      return 0;
    }
  } catch (err) {
    console.error(`[Scheduler] Unexpected error publishing post ${post.id}:`, err);
    await releaseLock(post.id, lockId);
    return 0;
  }
}

/**
 * Check if the current time matches the schedule's posting time and day.
 * Uses UTC conversion: postingTime is in the user's timezone, so we convert to UTC
 * to compare against the current UTC time.
 */
function isPostingTime(schedule: ScheduleRow, now: Date): boolean {
  // A schedule with no posting time configured can never fire — skip it
  // instead of crashing every tick on `null.split`.
  if (!schedule.postingTime || !schedule.postingTime.includes(":")) {
    return false;
  }

  const tz = schedule.postingTimezone || "UTC";
  const [targetHour, targetMinute] = schedule.postingTime.split(":").map(Number);

  // Get the current time in the user's timezone
  const userTimeStr = now.toLocaleString("en-US", { timeZone: tz });
  const userTime = new Date(userTimeStr);

  const currentHour = userTime.getHours();
  const currentMinute = userTime.getMinutes();
  const currentDay = userTime.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Check if it's within the posting minute window
  // We check if the current minute matches (allows 60s window)
  if (currentHour !== targetHour || currentMinute !== targetMinute) {
    return false;
  }

  // Check if today is a posting day
  if (!schedule.postingDays.includes(currentDay)) {
    return false;
  }

  return true;
}

/**
 * Count how many posts this user has published today (UTC).
 */
async function getPublishedCountToday(userId: string): Promise<number> {
  const [result] = await sql`
    SELECT COUNT(*)::int AS cnt FROM posts
    WHERE "userId" = ${userId}
    AND status = 'PUBLISHED'
    -- publishedAt is naive-UTC; compare against the UTC calendar day
    AND "publishedAt" >= (now() AT TIME ZONE 'UTC')::date
    AND "publishedAt" < ((now() AT TIME ZONE 'UTC')::date + 1)
  `;
  return result?.cnt || 0;
}

/**
 * Get the next READY post from the queue (lowest queuePosition first).
 */
async function getNextReadyPost(userId: string): Promise<PostRow | null> {
  const posts = await sql`
    SELECT id, content, "imageUrl", "queuePosition"
    FROM posts
    WHERE "userId" = ${userId}
    AND status = 'READY'
    AND "publishLockId" IS NULL
    ORDER BY "queuePosition" ASC NULLS LAST, "createdAt" ASC
    LIMIT 1
  `;
  return (posts[0] as PostRow) || null;
}

/**
 * Acquire an idempotency lock on a post.
 * Only one worker can process a post at a time.
 * Returns true if the lock was acquired, false if already locked.
 */
async function acquireLock(postId: string, lockId: string): Promise<boolean> {
  const result = await sql`
    UPDATE posts
    SET "publishLockId" = ${lockId}, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE id = ${postId}
    AND ("publishLockId" IS NULL OR "publishLockId" = '')
    RETURNING id
  `;
  return result.length > 0;
}

/**
 * Release a lock on a post.
 */
async function releaseLock(postId: string, lockId: string): Promise<void> {
  await sql`
    UPDATE posts
    SET "publishLockId" = NULL, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE id = ${postId} AND "publishLockId" = ${lockId}
  `;
}

/**
 * Get scheduler status for the admin/monitoring page.
 */
export async function getSchedulerStatus(): Promise<{
  running: boolean;
  activeSchedules: number;
  lastTickDurationMs: number;
}> {
  const [result] = await sql`
    SELECT COUNT(*)::int AS cnt FROM publish_schedules
    WHERE "isPaused" = false AND mode != 'manual'
  `;
  return {
    running: schedulerInterval !== null,
    activeSchedules: result?.cnt || 0,
    lastTickDurationMs: 0,
  };
}
