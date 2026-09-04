"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsProfilePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [occupation, setOccupation] = useState("");
  const [expertise, setExpertise] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [linkedinGoals, setLinkedinGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/account/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setName(data.data.user?.name || "");
          setEmail(data.data.user?.email || "");
          setOccupation(data.data.profile?.occupation || "");
          setExpertise(data.data.profile?.expertise || []);
          setTargetAudience(data.data.profile?.targetAudience || []);
          setLinkedinGoals(data.data.profile?.linkedinGoals || []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, occupation, expertise, targetAudience, linkedinGoals }),
      });
      setMessage("Profile updated!");
    } catch {
      setMessage("Failed to save.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>

      {message && (
        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">{message}</div>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <Input value={email} disabled />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Onboarding Data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Identity</label>
            <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expertise</label>
            <div className="flex flex-wrap gap-2">
              {expertise.map((e) => (
                <span key={e} className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {e}
                  <button onClick={() => setExpertise(expertise.filter((x) => x !== e))} className="ml-1 text-gray-400">×</button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Target Audience</label>
            <div className="flex flex-wrap gap-2">
              {targetAudience.map((a) => (
                <span key={a} className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {a}
                  <button onClick={() => setTargetAudience(targetAudience.filter((x) => x !== a))} className="ml-1 text-gray-400">×</button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">LinkedIn Goals</label>
            <div className="flex flex-wrap gap-2">
              {linkedinGoals.map((g) => (
                <span key={g} className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {g}
                  <button onClick={() => setLinkedinGoals(linkedinGoals.filter((x) => x !== g))} className="ml-1 text-gray-400">×</button>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
