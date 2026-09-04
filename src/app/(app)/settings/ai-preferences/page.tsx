"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AiPreferencesPage() {
  const [defaultTone, setDefaultTone] = useState("My Voice");
  const [defaultLength, setDefaultLength] = useState("medium");
  const [message, setMessage] = useState("");

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">AI Preferences</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Generation Defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Default Tone</label>
            <select
              value={defaultTone}
              onChange={(e) => setDefaultTone(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option>My Voice (uses Voice DNA)</option>
              <option>Professional</option>
              <option>Casual</option>
              <option>Contrarian</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Default Length</label>
            <select
              value={defaultLength}
              onChange={(e) => setDefaultLength(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="short">Short (1-2 paragraphs)</option>
              <option value="medium">Medium (3-5 paragraphs)</option>
              <option value="long">Long (6+ paragraphs)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => setMessage("Preferences saved!")}>
        {message || "Save Preferences"}
      </Button>
    </div>
  );
}
