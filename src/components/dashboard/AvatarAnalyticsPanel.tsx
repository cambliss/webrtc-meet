"use client";

import { useEffect, useState } from "react";

type AvatarStats = {
  stats: {
    uploads: { count: number; uniqueUsers: number; lastEvent: string | null };
    deletes: { count: number; uniqueUsers: number; lastEvent: string | null };
    views: { count: number; uniqueUsers: number; lastEvent: string | null };
  };
  adoption: {
    rate: number;
    usersWithAvatar: number;
  };
};

export function AvatarAnalyticsPanel() {
  const [stats, setStats] = useState<AvatarStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/analytics/avatar-events", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Failed to fetch analytics");
        }

        const data = (await response.json()) as AvatarStats;
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#d9e5f8] bg-white p-6 text-center">
        <p className="text-sm text-[#5f6368]">Loading avatar analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[#f6c4bf] bg-[#fdeceb] p-6">
        <p className="text-sm font-medium text-[#b42318]">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-[#e3ebfa] bg-[#f8fbff] p-6">
        <p className="text-sm text-[#5f6368]">No analytics data available.</p>
      </div>
    );
  }

  const statKeys: Array<"uploads" | "deletes" | "views"> = ["uploads", "deletes", "views"];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#d9e5f8] bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#202124]">Adoption Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-gradient-to-br from-[#eef4ff] to-[#dbe9ff] p-4">
            <p className="text-sm font-medium text-[#1a73e8]">Adoption Rate</p>
            <p className="mt-2 text-3xl font-bold text-[#1a73e8]">{stats.adoption.rate.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-[#eaf8ef] to-[#d5f0df] p-4">
            <p className="text-sm font-medium text-[#1b7f35]">Users with Avatars</p>
            <p className="mt-2 text-3xl font-bold text-[#1b7f35]">{stats.adoption.usersWithAvatar}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e5f8] bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#202124]">Event Statistics</h2>
        <div className="space-y-3">
          {statKeys.map((key) => {
            const stat = stats.stats[key];
            const label = key === "uploads" ? "Uploads" : key === "deletes" ? "Deletes" : "Views";
            return (
              <div key={key} className="rounded-xl border border-[#e3ebfa] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">{label}</p>
                    <p className="mt-1 text-xs text-[#5f6368]">
                      {stat.uniqueUsers} unique user{stat.uniqueUsers !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#202124]">{stat.count}</p>
                    {stat.lastEvent && (
                      <p className="text-xs text-[#5f6368]">
                        Last: {new Date(stat.lastEvent).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
