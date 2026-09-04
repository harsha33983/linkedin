"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Current Plan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Free Plan</p>
              <p className="text-sm text-gray-500">
                Limited AI generations, basic Voice DNA, limited ideas, draft storage.
              </p>
            </div>
            <Button>Upgrade to Creator</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Creator Plan</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>✓ Higher AI generation limits</li>
            <li>✓ Advanced Voice DNA (multi-source weighting, higher sample cap)</li>
            <li>✓ Unlimited drafts</li>
            <li>✓ Content Calendar</li>
            <li>✓ More content ideas</li>
            <li>✓ Advanced rewriting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
