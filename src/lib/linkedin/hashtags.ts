/**
 * Trending Hashtag Service
 *
 * Before a post is published to LinkedIn, 3-5 relevant hashtags are appended
 * to the content. Hashtags are derived from:
 *   1. The post's topic + the user's content pillars (highest weight)
 *   2. NLP keyword extraction from the post body itself (max 2, repeated words)
 *   3. A curated map of LinkedIn-trending hashtag clusters per theme
 *
 * Fully deterministic and zero-latency: no LLM call, so publishing is never
 * blocked or slowed by tag generation.
 */

/** Curated hashtag clusters by theme. Each cluster mixes high-volume
 * "trending" tags with mid-size niche tags — the mix that performs best on
 * LinkedIn (3-5 tags total, never a wall of 10). */
const TRENDING_CLUSTERS: Record<string, string[]> = {
  ai: ["#ArtificialIntelligence", "#AI", "#MachineLearning", "#FutureOfWork", "#TechInnovation"],
  saas: ["#SaaS", "#Startups", "#ProductLedGrowth", "#B2B", "#BuildInPublic"],
  software: ["#SoftwareEngineering", "#WebDevelopment", "#Coding", "#Programming", "#DevLife"],
  "software engineering": ["#SoftwareEngineering", "#CleanCode", "#Programming", "#TechLeadership", "#Engineering"],
  coding: ["#Coding", "#100DaysOfCode", "#Programming", "#WebDev", "#Developer"],
  developer: ["#Developer", "#SoftwareEngineering", "#TechCommunity", "#Programming", "#CodeNewbie"],
  startups: ["#Startups", "#Entrepreneurship", "#Founders", "#StartupLife", "#VentureCapital"],
  startup: ["#Startups", "#Founder", "#Entrepreneurship", "#BuildInPublic", "#GrowthHacking"],
  marketing: ["#DigitalMarketing", "#ContentMarketing", "#MarketingStrategy", "#GrowthMarketing", "#BrandBuilding"],
  content: ["#ContentMarketing", "#ContentCreation", "#PersonalBranding", "#MarketingStrategy", "#CopywritingTips"],
  leadership: ["#Leadership", "#Management", "#TeamCulture", "#PeopleFirst", "#ExecutiveCoaching"],
  career: ["#CareerGrowth", "#CareerAdvice", "#ProfessionalDevelopment", "#JobSearch", "#CareerDevelopment"],
  interview: ["#CareerAdvice", "#InterviewTips", "#JobSearch", "#CareerGrowth", "#Hiring"],
  productivity: ["#Productivity", "#TimeManagement", "#WorkSmarter", "#Focus", "#Habits"],
  consistency: ["#Consistency", "#PersonalDevelopment", "#Habits", "#GrowthMindset", "#Discipline"],
  morning: ["#MorningRoutine", "#Productivity", "#Habits", "#WellBeing", "#PersonalDevelopment"],
  motivation: ["#Motivation", "#Mindset", "#PersonalDevelopment", "#GrowthMindset", "#Inspiration"],
  success: ["#Success", "#PersonalDevelopment", "#GrowthMindset", "#Motivation", "#CareerGrowth"],
  entrepreneurship: ["#Entrepreneurship", "#Startups", "#Founders", "#BusinessGrowth", "#SmallBusiness"],
  design: ["#Design", "#UXDesign", "#ProductDesign", "#DesignThinking", "#Creativity"],
  data: ["#DataScience", "#Analytics", "#DataDriven", "#BigData", "#MachineLearning"],
  cloud: ["#CloudComputing", "#DevOps", "#CloudNative", "#AWS", "#TechTrends"],
  security: ["#CyberSecurity", "#InfoSec", "#DataSecurity", "#TechSecurity", "#Privacy"],
  finance: ["#Finance", "#Fintech", "#Investing", "#PersonalFinance", "#Economics"],
  education: ["#Education", "#Learning", "#EdTech", "#Teaching", "#Upskilling"],
  health: ["#Health", "#WellBeing", "#Wellness", "#MentalHealth", "#WorkLifeBalance"],
  sales: ["#Sales", "#B2BSales", "#SalesStrategy", "#SalesLeadership", "#RevenueGrowth"],
  hiring: ["#Hiring", "#Recruiting", "#TalentAcquisition", "#HR", "#Jobs"],
};

/** Topic words that map to a cluster key (substring matching on the topic). */
const TOPIC_TO_CLUSTER: Array<[string, string]> = [
  ["ai", "ai"],
  ["artificial intelligence", "ai"],
  ["machine learning", "ai"],
  ["agent", "ai"],
  ["saas", "saas"],
  ["startup", "startups"],
  ["founder", "startups"],
  ["software", "software"],
  ["engineer", "software engineering"],
  ["coding", "coding"],
  ["developer", "developer"],
  ["marketing", "marketing"],
  ["content", "content"],
  ["leadership", "leadership"],
  ["career", "career"],
  ["interview", "interview"],
  ["productivity", "productivity"],
  ["consistency", "consistency"],
  ["morning", "morning"],
  ["motivation", "motivation"],
  ["success", "success"],
  ["entrepreneur", "entrepreneurship"],
  ["design", "design"],
  ["data", "data"],
  ["cloud", "cloud"],
  ["security", "security"],
  ["finance", "finance"],
  ["education", "education"],
  ["health", "health"],
  ["wellness", "health"],
  ["sales", "sales"],
  ["hiring", "hiring"],
  ["recruit", "hiring"],
];

/** Words too generic to make a good hashtag. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "your", "from", "have", "what",
  "when", "how", "why", "who", "are", "was", "were", "been", "being", "will",
  "would", "could", "should", "into", "about", "after", "before", "over",
  "under", "then", "than", "them", "they", "their", "there", "here", "where",
  "just", "only", "more", "most", "some", "very", "much", "many", "also",
  "because", "while", "during", "between", "through", "against", "without",
  "within", "along", "across", "behind", "beyond", "plus", "except", "but",
  "not", "you", "your", "yours", "our", "ours", "his", "her", "hers", "its",
  "it's", "don't", "didn't", "doesn't", "isn't", "wasn't", "aren't", "won't",
  "can't", "cannot", "i'm", "i've", "i'll", "i'd", "you're", "you've",
  "we're", "we've", "they're", "they've", "let", "lets", "let's", "get",
  "got", "make", "made", "really", "actually", "literally", "thing",
  "things", "way", "ways", "day", "days", "time", "times", "people",
  // Common verbs / adjectives that produce junk hashtags (#Happens, #Says…)
  "happens", "happened", "shows", "showed", "show", "says", "said", "say",
  "everyone", "someone", "anyone", "nobody", "everybody", "know", "knew",
  "think", "thought", "feel", "felt", "want", "wanted", "need", "needed",
  "take", "took", "give", "gave", "come", "came", "went", "goes",
  "found", "find", "look", "looks", "looked", "seems", "seemed",
  "every", "each", "another", "other", "such", "own", "same", "still",
  "even", "ever", "never", "always", "often", "once", "twice",
  "three", "four", "five", "week", "month", "year", "years", "hour", "hours",
  "minute", "minutes", "second", "today", "tomorrow", "yesterday",
  "less", "least", "best", "better", "worse", "worst", "good", "great",
  "real", "true", "false", "simple", "simply", "easy", "hard", "small",
  "big", "large", "long", "short", "high", "low", "new", "old", "last",
  "first", "next", "start", "started", "stop", "stopped", "try", "tried",
  "work", "works", "working", "team", "teams", "build", "builds", "building",
]);

/** Extract candidate keywords from the post body (deterministic NLP). */
function extractKeywords(text: string, limit = 12): Array<{ word: string; count: number }> {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\w]+/g, " ") // existing hashtags are not keywords
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

/** Normalize a keyword into a LinkedIn-style CamelCase hashtag. */
function toHashtag(word: string): string {
  const cleaned = word.replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned) return "";
  // Single word → PascalCase; multi word → CamelCase joined
  return (
    cleaned.charAt(0).toUpperCase() +
    cleaned.slice(1)
  );
}

/** Build a deterministic hashtag set from topic, pillars, and content. */
function deterministicHashtags(
  content: string,
  topic?: string | null,
  contentPillars?: string[]
): string[] {
  const tags: string[] = [];
  const push = (tag: string) => {
    const t = tag.trim();
    if (t && !tags.includes(t)) tags.push(t);
  };

  // 1. Topic → cluster match (highest signal)
  const topicLower = (topic || "").toLowerCase();
  let cluster: string[] | null = null;
  for (const [needle, key] of TOPIC_TO_CLUSTER) {
    if (topicLower.includes(needle)) {
      cluster = TRENDING_CLUSTERS[key];
      break;
    }
  }
  if (cluster) {
    cluster.slice(0, 2).forEach(push);
  }

  // 2. Content pillars (user's declared expertise / goals)
  for (const pillar of (contentPillars || []).slice(0, 2)) {
    const p = pillar.toLowerCase();
    let matched = false;
    for (const [needle, key] of TOPIC_TO_CLUSTER) {
      if (p.includes(needle)) {
        TRENDING_CLUSTERS[key].slice(0, 1).forEach(push);
        matched = true;
        break;
      }
    }
    // Fallback: pillar itself as a tag if no cluster matched
    if (!matched) {
      push(toHashtag(pillar));
    }
  }

  // 3. Keyword extraction from the post body — max 2 of these so the tag
  // set stays trending/cluster-driven rather than a wall of body nouns.
  const keywords = extractKeywords(content, 8);
  let keywordTags = 0;
  for (const kw of keywords) {
    if (tags.length >= 5 || keywordTags >= 2) break;
    // Prefer keywords that repeat — single mentions are often noise.
    if (kw.count < 2 && tags.length >= 3) break;
    const tag = toHashtag(kw.word);
    if (tag && tag.length > 3) {
      push(`#${tag}`);
      keywordTags++;
    }
  }

  // 4. Top up from the matched cluster so we always reach 3-5 tags
  if (cluster && tags.length < 3) {
    cluster.slice(2, 5).forEach(push);
  }

  return tags.slice(0, 5);
}

export interface HashtagOptions {
  content: string;
  topic?: string | null;
  contentPillars?: string[];
  userId?: string;
  /** Skip the AI enhancement entirely (used by tests / cheap paths). */
  skipAi?: boolean;
}

/**
 * Generate 3-5 trending hashtags for a post before publishing.
 * Deterministic core + optional AI enhancement (fail-open).
 */
export async function generateHashtags(
  options: HashtagOptions
): Promise<string[]> {
  const { content, topic, contentPillars } = options;
  const base = deterministicHashtags(content, topic, contentPillars);

  // Ensure at least 3 tags; if the deterministic pass can't reach 3,
  // fall back to a generic professional set.
  if (base.length < 3) {
    for (const t of ["#ProfessionalGrowth", "#LinkedInCreator", "#Insights"]) {
      if (base.length >= 3) break;
      if (!base.includes(t)) base.push(t);
    }
  }

  // Fully deterministic — no LLM call, zero added latency, and the trending
  // clusters are curated from what performs on LinkedIn. The function stays
  // async so callers can treat it as an I/O step (allows adding an AI pass
  // later without touching call sites).
  return base;
}

