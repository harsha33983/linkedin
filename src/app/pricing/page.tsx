"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic AI content generation",
    features: [
      "10 AI generations per month",
      "Basic Voice DNA (up to 10 samples)",
      "5 content ideas per day",
      "Draft storage",
      "Copy-to-clipboard publishing",
      "Voice DNA confirmation loop",
      "Rejection feedback capture",
    ],
    cta: "Start for free",
    ctaHref: "/signup",
    highlight: false,
  },
  {
    name: "Creator",
    price: "$19",
    period: "/month",
    description: "Full power for serious LinkedIn creators",
    features: [
      "100 AI generations per month",
      "Advanced Voice DNA (50 samples, multi-source weighting)",
      "Unlimited content ideas",
      "Unlimited drafts",
      "Content Calendar",
      "LinkedIn Connect & Auto-Publish",
      "Advanced rewriting",
      "Hook generator with voice-fit scoring",
      "Post analyzer",
      "Priority processing",
    ],
    cta: "Start Creator plan",
    ctaHref: "/signup?plan=creator",
    highlight: true,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b">
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

      {/* Pricing Header */}
      <div className="text-center py-16 px-6">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Start free, upgrade when you&apos;re ready. We never price-gate the
          feedback loops that make Voice DNA better for everyone.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative ${plan.highlight ? "ring-2 ring-gray-900" : ""}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gray-900 text-white">Most popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.ctaHref}>
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trust Note */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p className="mb-2">
            <strong>PRD §19 compliance:</strong> Voice DNA confirmation and
            rejection feedback are never paywalled — they&apos;re learning signals we
            need from every user.
          </p>
          <p>
            No contracts. Cancel anytime. Full data export always available.
          </p>
        </div>
      </div>
    </div>
  );
}
