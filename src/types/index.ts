// ─── User & Profile ──────────────────────────────────────────

export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  occupation: string | null;
  expertise: string[];
  targetAudience: string[];
  linkedinGoals: string[];
  preferences: UserPreferences | null;
}

export interface UserPreferences {
  voiceSliders: VoiceSliders;
  [key: string]: unknown;
}

export interface VoiceSliders {
  professionalCasual: number; // 0–100 (0=professional, 100=casual)
  educationalPersonal: number; // 0=educational, 100=personal
  safeContrarian: number; // 0=safe, 100=contrarian
  simpleDetailed: number; // 0=simple, 100=detailed
}

// ─── Voice DNA ───────────────────────────────────────────────

export type ConfidenceTier = "Emerging" | "Solid" | "Strong";

export interface VoiceProfile {
  id: string;
  userId: string;
  version: number;
  confidenceScore: number;
  sampleCount: number;
  userConfirmed: boolean;
  lastUpdated: string;

  tone: string[];
  sentenceStyle: string | null;
  paragraphStyle: string | null;
  hookPatterns: string[];
  ctaStyle: string | null;
  emojiUsage: string | null;
  commonTopics: string[];
  wordsToAvoid: string[];
  writingPatterns: unknown;
  sourceWeighting: Record<string, number> | null;
  metadata: unknown;
}

export interface WritingSample {
  id: string;
  userId: string;
  content: string;
  source: string | null;
  sourceType: string | null;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Content ─────────────────────────────────────────────────

export type PostStatus =
  | "DRAFT"
  | "SAVED"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ARCHIVED";

export type PostFormat =
  | "Educational"
  | "Personal story"
  | "Contrarian"
  | "Opinion"
  | "Listicle"
  | "Framework"
  | "Case study"
  | "Lesson learned"
  | "Announcement"
  | "Promotional";

export interface Post {
  id: string;
  userId: string;
  title: string | null;
  content: string;
  topic: string | null;
  format: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  voiceDnaVersionUsed: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentIdea {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  topic: string | null;
  format: string | null;
  status: string;
  suggestionReason: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

// ─── AI Generation ───────────────────────────────────────────

export type GenerationType =
  | "post"
  | "hook"
  | "idea"
  | "rewrite"
  | "voice_analysis";

export type RejectionReason =
  | "wrong_tone"
  | "not_my_experience"
  | "too_generic"
  | "wrong_format"
  | "other";

export interface Generation {
  id: string;
  userId: string;
  type: GenerationType;
  input: unknown;
  output: unknown;
  model: string | null;
  voiceDnaVersionUsed: number | null;
  rejectionReason: RejectionReason | null;
  rejectedAt: string | null;
  createdAt: string;
}

// ─── AI Provider Types ───────────────────────────────────────

export interface VoiceAnalysisConfig {
  sourceWeighting?: Record<string, number>;
}

export interface VoiceAnalysisResult {
  tone: string[];
  sentenceStyle: string;
  paragraphStyle: string;
  hookPatterns: string[];
  ctaStyle: string;
  emojiUsage: string;
  commonTopics: string[];
  wordsToAvoid: string[];
  writingPatterns: unknown;
  consistencyScore: number; // 0–1
}

export interface GeneratePostParams {
  topic: string;
  goal?: string;
  format?: PostFormat;
  tone?: string;
  length?: "short" | "medium" | "long";
  targetAudience?: string;
  voiceProfile: VoiceProfile;
  userProfile: UserProfile;
  recentPosts?: any[];
  trendingTopics?: any[];
  contentPillars?: string[];
  dnaProfile?: any; // FullDNAProfile from @/lib/dna
}

export interface GeneratePostResult {
  versions: PostVersion[];
  performance_analysis?: PerformanceAnalysis;
  content_opportunities?: ContentOpportunity[];
  selected_opportunity?: SelectedOpportunity;
  hooks?: GeneratedHook[];
  reasoning_summary?: ReasoningSummary;
  confidence?: GenerationConfidence;
  metadata: {
    model: string;
    voiceDnaVersionUsed: number;
    confidenceScore: number;
  };
}

export interface PostVersion {
  id: string;
  label: string; // "Recommended", "Different angle", "Alternative format"
  content: string;
  hook: string;
  format: PostFormat;
  scores: {
    overall: number;
    voiceFit: number;
  };
  imageQuery?: string; // search query for image generation
  imageUrl?: string;   // resolved image URL
  structure?: string;  // e.g. "Hook → Story → Lesson"
}

export interface PerformanceAnalysis {
  top_topics: string[];
  top_hook_patterns: string[];
  top_structures: string[];
  top_formats: string[];
  best_length: string;
  best_posting_window: string;
  key_audience_signals: string[];
}

export interface ContentOpportunity {
  topic: string;
  why_now: string;
  historical_connection: string;
  trend_connection: string;
  audience_relevance: string;
  potential_hook: string;
  opportunity_score: number;
}

export interface SelectedOpportunity {
  topic: string;
  reason: string;
  score: number;
}

export interface GeneratedHook {
  hook: string;
  style: string;
  score: number;
}

export interface ReasoningSummary {
  why_this_topic: string;
  why_this_hook: string;
  why_this_structure: string;
  what_historical_signal_influenced_it: string;
  what_trend_influenced_it: string;
}

export interface GenerationConfidence {
  overall: "HIGH" | "MEDIUM" | "LOW";
  performance_data: "HIGH" | "MEDIUM" | "LOW";
  trend_signal: "HIGH" | "MEDIUM" | "LOW";
  voice_dna: "HIGH" | "MEDIUM" | "LOW";
}

export interface GenerateHookParams {
  topic: string;
  targetAudience?: string;
  hookType?: string;
  voiceProfile: VoiceProfile;
}

export interface GenerateHookResult {
  hooks: Hook[];
  metadata: {
    model: string;
    voiceDnaVersionUsed: number;
  };
}

export interface Hook {
  id: string;
  text: string;
  type: string;
  scores: {
    structural: number;
    voiceFit: number;
  };
  explanation: string;
}

/** Aggregate of the user's real publishing activity (posts + engagement). */
export interface ActivityProfile {
  publishedCount: number;
  sampleSize: number; // posts with measurable engagement
  avgEngagementRate: number;
  topTopics: Array<{ topic: string; posts: number; bestEngagement: number; avgEngagement: number }>;
  topFormats: Array<{ format: string; posts: number; avgEngagement: number }>;
  topHooks: Array<{ hook: string; posts: number; avgEngagement: number }>;
  bestPerformingPosts: Array<{
    topic: string;
    format: string;
    hook: string;
    engagementRate: number;
  }>;
  recentTopics: string[]; // most recently covered topics (any post)
  recentHooks: string[]; // recent opening hooks to avoid repeating
}

export interface GenerateIdeaParams {
  expertise: string[];
  targetAudience: string[];
  goals: string[];
  voiceProfile: VoiceProfile;
  previousContent?: string[];
  rejectionHistory?: string[];
  /** Real activity signals computed from the user's posts + engagement. */
  activityProfile?: ActivityProfile;
  /** Already-active idea titles to avoid generating again. */
  activeIdeas?: string[];
  /** Formatted Performance / Audience / Trend DNA summaries. */
  performanceSummary?: string;
  audienceSummary?: string;
  trendSummary?: string;
}

export interface GenerateIdeaResult {
  ideas: IdeaSuggestion[];
  metadata: {
    model: string;
  };
}

export interface IdeaSuggestion {
  title: string;
  description: string;
  topic: string;
  format: PostFormat;
  category: string;
  suggestionReason: string;
}

export interface RewriteParams {
  content: string;
  instructions: string;
  voiceProfile: VoiceProfile;
}

export interface RewriteResult {
  rewritten: string;
  changes: string[];
  metadata: {
    model: string;
    voiceDnaVersionUsed: number;
  };
}

export interface QualityCheckResult {
  passes: boolean;
  fabricatedClaims: boolean;
  inventedAnecdotes: boolean;
  hookRepetition: boolean;
  details: string[];
}

// ─── LinkedIn (Phase 4) ──────────────────────────────────────

export type PublishMode = "manual" | "approved_queue" | "full_auto";

export interface LinkedInConnection {
  id: string;
  userId: string;
  linkedInMemberId: string | null;
  status: string;
  connectedAt: string;
}

export interface PublishSchedule {
  id: string;
  userId: string;
  mode: PublishMode;
  postingTime: string | null;
  postingDays: number[];
  maxPerDay: number;
  isPaused: boolean;
}

export interface PublishLog {
  id: string;
  postId: string;
  userId: string;
  publishedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  status: string;
  errorMessage: string | null;
}

// ─── API Response Types ──────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

import type { ProfileNLPReport } from "@/lib/profile-review/nlp";

// ─── LinkedIn Profile Review Tool ─────────────────────────────

export interface ProfileReviewInput {
  headline?: string;
  about?: string;
  experience?: string;
  skills?: string[];
  education?: string;
}

export interface ProfileReviewCategoryScore {
  key: string;
  label: string;
  score: number;
  weight: number;
}

export interface ProfileReviewRecommendation {
  id: string;
  category: string;
  categoryLabel: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  problem: string;
  why: string;
  recommendation: string;
  example?: string;
  impact: number;
}

export interface ProfileReviewDataSource {
  source: string | null;
  retrievedAt: string | null;
  partial: boolean;
  missingFields: string[];
  notice: string | null;
}

export interface ProfileReviewIntelligence {
  professionalIdentity: string;
  primaryExpertise: string[];
  secondaryExpertise: string[];
  industry: string | null;
  careerLevel: string | null;
  likelyTargetRoles: string[];
  positioning: string;
  keywordClusters: { cluster: string; keywords: string[] }[];
  brandThemes: string[];
  potentialAudience: string | null;
  contentPillars: string[];
  contentIdeas: string[];
  thirtyDayPlan: { week: string; focus: string; actions: string[] }[];
}

export interface ProfileReviewResult {
  analysisId: string | null;
  profileUrl: string | null;
  username: string | null;
  usedAi: boolean;
  aiProvider: string | null;
  aiNotice: string | null;
  overallScore: number;
  band: { key: string; label: string };
  summaryLine: string;
  categories: ProfileReviewCategoryScore[];
  sections: ProfileNLPReport;
  recommendations: ProfileReviewRecommendation[];
  topRecommendations: ProfileReviewRecommendation[];
  suggestions: Record<string, unknown>;
  intelligence: ProfileReviewIntelligence;
  dataSource: ProfileReviewDataSource;
  identity: {
    name: string | null;
    headline: string | null;
    currentRole: string | null;
    currentCompany: string | null;
    location: string | null;
  };
  weights: Record<string, number>;
  analyzedAt: string;
  profileData: ProfileReviewInput & { skills: string[] };
}

// ─── UI Types ────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: number;
}
