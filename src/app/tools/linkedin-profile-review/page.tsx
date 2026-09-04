import type { Metadata } from "next";
import Link from "next/link";
import ReviewTool from "@/components/profile-review/review-tool";

export const metadata: Metadata = {
  title: "AI LinkedIn Profile Review – Free Profile Analyzer",
  description:
    "Get a free AI-powered LinkedIn profile review. Analyze your headline, About section, experience, skills, keywords, and personal branding with actionable optimization recommendations.",
  keywords: [
    "AI LinkedIn profile review",
    "LinkedIn profile analyzer",
    "LinkedIn profile checker",
    "LinkedIn profile optimization",
    "LinkedIn headline analyzer",
    "LinkedIn About section review",
    "LinkedIn personal branding",
    "free LinkedIn profile review",
  ],
  alternates: {
    canonical: "/tools/linkedin-profile-review",
  },
  openGraph: {
    title: "AI LinkedIn Profile Review – Free Profile Analyzer",
    description:
      "Get a free AI-powered LinkedIn profile review. Analyze your headline, About section, experience, skills, keywords, and personal branding with actionable optimization recommendations.",
    type: "website",
    url: "/tools/linkedin-profile-review",
    siteName: "LinkedGrow AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI LinkedIn Profile Review – Free Profile Analyzer",
    description:
      "Get a free AI-powered LinkedIn profile review with actionable optimization recommendations.",
  },
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is this LinkedIn profile review free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can analyze a LinkedIn profile up to 3 times per day without an account. Signed-in users get 5 free analyses per month, and deeper features like Voice DNA and post generation are available when you create a free account.",
      },
    },
    {
      "@type": "Question",
      name: "How does the AI analyze my profile?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Our analyzer first runs a deterministic NLP pass over your headline, About section, experience, skills, and keyword coverage. An AI model then generates tailored rewrites and recommendations. Because LinkedIn does not allow automated retrieval of public profiles, you paste your profile content and we analyze exactly what you supply — we never guess or fabricate profile data.",
      },
    },
    {
      "@type": "Question",
      name: "Can AI rewrite my LinkedIn headline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The review suggests a rewritten headline built only from information you supplied. The suggestion is editable, and you can copy it directly into LinkedIn. If key information is missing, we tell you to add it rather than inventing it.",
      },
    },
    {
      "@type": "Question",
      name: "Can AI improve my LinkedIn About section?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. We analyze your current About for opening strength, storytelling, keywords, readability, and a call to action, then generate an editable rewrite. Missing metrics are flagged as placeholders like 'Add a measurable result here' rather than fabricated.",
      },
    },
    {
      "@type": "Question",
      name: "Does this guarantee more LinkedIn views?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Nobody can guarantee LinkedIn ranking or views. We improve search visibility signals — keyword coverage, positioning, completeness — which can help your profile appear in more relevant searches, but results vary by audience and market.",
      },
    },
    {
      "@type": "Question",
      name: "Can I connect my LinkedIn account?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Signed-in users can connect their LinkedIn account for publishing and scheduling. The profile review itself accepts pasted content, since LinkedIn's terms do not permit automated scraping of public profiles.",
      },
    },
    {
      "@type": "Question",
      name: "Is my profile data stored?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Anonymous reviews are not stored. Signed-in users' analyses are stored so they can build their Voice DNA and track improvement over time. Your profile content is only used to generate your report and is never shared.",
      },
    },
  ],
};

const TOOLS = [
  { name: "AI LinkedIn Post Generator", href: "/create/ai-post", desc: "Generate on-brand LinkedIn posts in your voice." },
  { name: "LinkedIn Hook Generator", href: "/create/hooks", desc: "Opening lines with structural + voice-fit scoring." },
  { name: "LinkedIn Content Analyzer", href: "/create/analyze", desc: "Check posts for quality, voice-fit, and issues." },
  { name: "LinkedIn Post Ideas", href: "/content/ideas", desc: "Personalized content ideas from your expertise." },
  { name: "LinkedIn Profile Review", href: "/tools/linkedin-profile-review", desc: "Free AI analysis of your profile strength." },
  { name: "Voice DNA", href: "/voice-dna", desc: "Build a data model of how you write." },
];

const CHECKLIST = [
  "Headline names your role AND specialization in 4–12 words",
  "About opens with who you help and the outcome you deliver",
  "About includes proof (results, years, focus areas) and a call to action",
  "Experience bullets start with action verbs and include metrics where true",
  "5–15 skills listed that match your headline keywords",
  "Key professional terms appear in at least two sections",
  "Profile is complete: headline, About, experience, skills, education",
  "A consistent personal brand story across every section",
];

export default function ProfileReviewPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b" aria-label="Main navigation">
        <Link href="/" className="text-xl font-bold">
          LinkedGrow AI
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-800"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="px-6 pt-14 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-blue-700 mb-4">
          AI LinkedIn Profile Review
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          Get a free AI-powered analysis and optimization tips for your LinkedIn profile.
        </p>
        <ReviewTool />
      </header>

      {/* 3 steps */}
      <section className="px-6 py-16 bg-gray-50" aria-labelledby="how-it-works">
        <div className="max-w-6xl mx-auto">
          <h2 id="how-it-works" className="text-3xl font-bold text-center mb-12">
            Get feedback on your LinkedIn profile in 3 steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-4">1</div>
              <h3 className="text-lg font-semibold mb-2">Enter Your LinkedIn URL</h3>
              <p className="text-sm text-gray-600">
                Simply input your LinkedIn profile URL and let our AI analyze the available profile information.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-4">2</div>
              <h3 className="text-lg font-semibold mb-2">Receive a Detailed Report</h3>
              <p className="text-sm text-gray-600">
                Get a comprehensive analysis highlighting strengths, weaknesses, and opportunities to improve.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-4">3</div>
              <h3 className="text-lg font-semibold mb-2">Optimize Your Profile</h3>
              <p className="text-sm text-gray-600">
                Follow personalized recommendations to improve your profile&apos;s clarity, visibility, and professional positioning.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SEO content */}
      <section className="px-6 py-16" aria-label="About LinkedIn profile reviews">
        <div className="max-w-3xl mx-auto space-y-12">
          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">What is a LinkedIn profile review?</h2>
            <p className="text-gray-700 leading-relaxed">
              A LinkedIn profile review is a structured analysis of your professional profile — your headline,
              About section, experience, skills, and keywords — against what recruiters, clients, and search
              algorithms look for. An AI LinkedIn profile analyzer scores each section, finds weak spots, and
              produces an optimization plan with concrete rewrites you can apply directly.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">Why optimize your LinkedIn profile?</h2>
            <p className="text-gray-700 leading-relaxed">
              Your LinkedIn profile is often your first impression: recruiters search it, clients look it up,
              and it appears when people Google your name. A well-optimized profile communicates your
              specialization in seconds, surfaces in more relevant searches, and converts visitors into
              opportunities. Small fixes — a sharper headline, quantified achievements, consistent keywords —
              compound into a much stronger professional presence.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">How AI analyzes your LinkedIn profile</h2>
            <p className="text-gray-700 leading-relaxed">
              The analyzer runs two layers. First, a deterministic NLP engine measures concrete features:
              headline length and specificity, About opening strength and calls to action, action verbs and
              quantified results in experience, skill count and keyword coverage across sections. Second, an
              AI model turns those findings into tailored rewrites and recommendations. Because LinkedIn does
              not allow automated access to public profiles, you paste your profile content and the analysis
              operates strictly on what you supply — nothing is scraped, and nothing is invented.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">How to improve your LinkedIn headline</h2>
            <p className="text-gray-700 leading-relaxed">
              Your headline is the most visible line of your profile. Aim for 4–12 words that name your role
              <em>and</em> your specialization: &ldquo;Staff Engineer | AI &amp; Developer Tools | Helping teams ship
              faster&rdquo; beats &ldquo;Software Engineer at Example Co.&rdquo; Lead with your function, add a niche or
              outcome, and include the keywords recruiters search for. Move anything longer into your About section.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">How to improve your LinkedIn About section</h2>
            <p className="text-gray-700 leading-relaxed">
              Open with who you help and the outcome you deliver, in the first two lines. Show credibility
              with years, focus areas, or results — never fabricated metrics. Keep paragraphs short and
              scannable, weave in your core keywords, and close with a call to action so interested visitors
              know what to do next.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-3">How to improve LinkedIn search visibility</h2>
            <p className="text-gray-700 leading-relaxed">
              LinkedIn and external search match your profile against keywords across the headline, About,
              experience, and skills. Choose 3–5 terms that describe your role and expertise, then use them
              consistently in at least two sections. Add 5–15 relevant skills and keep your profile complete.
              These signals improve the <em>likelihood</em> of appearing in relevant searches — nobody can
              guarantee ranking position.
            </p>
          </article>

          <article>
            <h2 className="text-2xl font-bold text-blue-700 mb-4">LinkedIn profile optimization checklist</h2>
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2 text-gray-700">
                  <span className="text-green-600 mt-0.5 shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* Free tools */}
      <section className="px-6 py-16 bg-gray-50" aria-labelledby="free-tools">
        <div className="max-w-6xl mx-auto">
          <h2 id="free-tools" className="text-3xl font-bold text-center text-blue-700 mb-3">
            Free AI LinkedIn Tools
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-xl mx-auto">
            Explore our collection of free AI LinkedIn tools to enhance your professional online presence.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
              >
                <h3 className="font-semibold mb-1 text-blue-700">{tool.name}</h3>
                <p className="text-sm text-gray-600">{tool.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16" aria-labelledby="faq">
        <div className="max-w-3xl mx-auto">
          <h2 id="faq" className="text-3xl font-bold text-center text-blue-700 mb-10">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQ_JSON_LD.mainEntity.map((faq) => (
              <details key={faq.name} className="bg-white border border-gray-200 rounded-xl p-5 group">
                <summary className="font-semibold cursor-pointer list-none flex items-center justify-between gap-3">
                  <span>{faq.name}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">{faq.acceptedAnswer.text}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t text-center text-sm text-gray-500">
        <p>
          &copy; {new Date().getFullYear()} LinkedGrow AI. All rights reserved.{" "}
          <Link href="/pricing" className="hover:underline">Pricing</Link>
        </p>
      </footer>
    </div>
  );
}