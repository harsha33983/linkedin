import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">LinkedGrow AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
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
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl">
          Your ideas. Your voice.
          <br />
          <span className="text-gray-500">
            AI that gets better at sounding like you over time.
          </span>
        </h1>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl">
          The Content Operating System for professional voice on LinkedIn.
          Understand your voice, generate on-brand content, and build a
          consistent presence — without sounding like everyone else&apos;s AI.
        </p>
        <div className="flex gap-4">
          <Link
            href="/signup"
            className="bg-gray-900 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-gray-800"
          >
            Start for free
          </Link>
          <Link
            href="#features"
            className="border border-gray-300 px-6 py-3 rounded-md text-base font-medium hover:bg-gray-50"
          >
            See how it works
          </Link>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="px-6 py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            The system, not just the tool
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Voice DNA</h3>
              <p className="text-gray-600">
                We analyze your writing samples to build a structured model of
                your voice — not a one-time prompt, but a living data asset that
                improves with every edit and rejection.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-2">
                Personalized Generation
              </h3>
              <p className="text-gray-600">
                Generate 3 post versions that actually sound like you. Voice DNA
                is a hard constraint, not a soft suggestion. Hook scoring
                includes voice-fit, not just generic virality.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-2">
                Compounding Quality
              </h3>
              <p className="text-gray-600">
                Every edit, every rejection, every published post makes the next
                generation better. The product gets measurably better at sounding
                like you the longer you use it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Start free, grow when ready</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Voice DNA confirmation and rejection feedback are never paywalled.
            Upgrade for higher limits and LinkedIn auto-publish.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="border rounded-lg p-6 text-left">
              <h3 className="font-semibold mb-2">Free</h3>
              <p className="text-2xl font-bold mb-3">$0<span className="text-sm text-gray-500">/forever</span></p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ 10 AI generations/month</li>
                <li>✓ Basic Voice DNA</li>
                <li>✓ Draft storage</li>
              </ul>
            </div>
            <div className="border-2 border-gray-900 rounded-lg p-6 text-left">
              <h3 className="font-semibold mb-2">Creator</h3>
              <p className="text-2xl font-bold mb-3">$19<span className="text-sm text-gray-500">/month</span></p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ 100 AI generations/month</li>
                <li>✓ Advanced Voice DNA</li>
                <li>✓ LinkedIn Auto-Publish</li>
              </ul>
            </div>
          </div>
          <Link href="/pricing" className="inline-block mt-6 text-sm text-gray-900 font-medium hover:underline">
            Compare plans →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} LinkedGrow AI. All rights reserved.
      </footer>
    </div>
  );
}
