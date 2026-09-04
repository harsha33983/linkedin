"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DataExportPage() {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setMessage("");
    try {
      const res = await fetch("/api/account/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `linkedgrow-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage("Export downloaded successfully!");
      } else {
        setMessage("Export failed. Please try again.");
      }
    } catch {
      setMessage("Export failed. Please try again.");
    }
    setExporting(false);
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Data Export</h1>

      <Card>
        <CardHeader>
          <CardTitle>Export Your Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Download all your data in a portable JSON format. This includes:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 mb-6">
            <li>• Writing samples (with source tags)</li>
            <li>• Voice DNA (all versions)</li>
            <li>• Posts (all statuses)</li>
            <li>• Generations (with rejection reasons)</li>
            <li>• Content ideas</li>
            <li>• Onboarding history</li>
          </ul>
          <p className="text-xs text-gray-500 mb-4">
            PRD §17: We never restrict data export to pressure retention.
            A moat built on genuinely good personalization doesn&apos;t need artificial lock-in.
          </p>

          {message && (
            <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded mb-4">
              {message}
            </div>
          )}

          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download Export"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
