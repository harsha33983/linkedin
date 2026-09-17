-- Better Auth Tables
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT false,
  "image" TEXT,
  "role" TEXT,
  "banned" BOOLEAN,
  "banReason" TEXT,
  "banExpires" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "idTokenExpiresAt" TIMESTAMP(3),
  "password" TEXT,
  UNIQUE("providerId", "accountId")
);

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- LinkedGrow Models
CREATE TABLE "user_profiles" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "occupation" TEXT,
  "expertise" TEXT[],
  "targetAudience" TEXT[],
  "linkedinGoals" TEXT[],
  "preferences" JSONB
);

CREATE TABLE "voice_profiles" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "lastUpdated" TIMESTAMP(3) NOT NULL,
  "tone" JSONB NOT NULL,
  "sentenceStyle" TEXT,
  "paragraphStyle" TEXT,
  "hookPatterns" JSONB NOT NULL,
  "ctaStyle" TEXT,
  "emojiUsage" TEXT,
  "commonTopics" JSONB NOT NULL,
  "wordsToAvoid" TEXT[],
  "writingPatterns" JSONB NOT NULL,
  "sourceWeighting" JSONB,
  "metadata" JSONB
);

CREATE TABLE "voice_profile_versions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "triggerReason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "version")
);

CREATE TABLE "writing_samples" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "source" TEXT,
  "sourceType" TEXT,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "onboarding_snapshots" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "step" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "posts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "topic" TEXT,
  "format" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "queuePosition" INTEGER,
  "scheduledAt" TIMESTAMP(3),
  "scheduledAtUTC" TIMESTAMP(3),
  "scheduledTimezone" TEXT,
  "publishedAt" TIMESTAMP(3),
  "externalPostId" TEXT,
  "publishingProvider" TEXT,
  "publishingResponse" JSONB,
  "voiceDnaVersionUsed" INTEGER,
  "publishLockId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "content_ideas" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "topic" TEXT,
  "format" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "suggestionReason" TEXT,
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "generations" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB NOT NULL,
  "model" TEXT,
  "voiceDnaVersionUsed" INTEGER,
  "rejectionReason" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overrides" JSONB
);

CREATE TABLE "performance_signals" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "metric" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "social_accounts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT,
  "tokenIv" TEXT NOT NULL,
  "refreshIv" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT[],
  "displayName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRefreshedAt" TIMESTAMP(3),
  "errorAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE("provider", "userId")
);

CREATE TABLE "publish_schedules" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "mode" TEXT NOT NULL DEFAULT 'manual',
  "postingTime" TEXT,
  "postingTimezone" TEXT DEFAULT 'UTC',
  "postingDays" INTEGER[],
  "maxPerDay" INTEGER NOT NULL DEFAULT 1,
  "isPaused" BOOLEAN NOT NULL DEFAULT false,
  "linkedinAccountId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "publish_logs" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "errorType" TEXT,
  "httpStatus" INTEGER,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "publishedBy" TEXT
);

CREATE TABLE "audit_logs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "targetType" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "queue_jobs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "postId" TEXT,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
