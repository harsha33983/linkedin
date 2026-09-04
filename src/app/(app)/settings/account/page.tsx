"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AccountPage() {
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Account</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Current Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <Input type="password" placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm New Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <Button variant="outline">Update Password</Button>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Deleting your account will permanently remove all your data including
            writing samples, Voice DNA, posts, and generation history. This action
            cannot be undone.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            PRD §17: We never restrict data export to pressure retention —
            please export your data first if you want to keep a copy.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                Type your email to confirm
              </label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <Button variant="destructive" disabled={!deleteConfirm}>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
