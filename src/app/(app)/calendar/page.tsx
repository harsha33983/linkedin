"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
} from "date-fns";
import { zonedTimeToUtc, toDateKey, DEFAULT_SCHEDULE_TZ } from "@/lib/tz";

interface Post {
  id: string;
  title: string | null;
  content: string;
  topic: string | null;
  format: string | null;
  status: string;
  queuePosition: number | null;
  scheduledAt: string | null;
  scheduledAtUTC: string | null;
  scheduledTimezone: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  imageUrl: string | null;
  createdAt: string;
}

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
    SAVED: "bg-blue-50 text-blue-700 border-blue-200",
    READY: "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED: "bg-green-50 text-green-700 border-green-200",
    SCHEDULED: "bg-purple-50 text-purple-700 border-purple-200",
    PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
  };
  return colors[status] || colors.DRAFT;
};

const statusDot = (status: string) => {
  const dots: Record<string, string> = {
    DRAFT: "bg-gray-400",
    SAVED: "bg-blue-400",
    READY: "bg-amber-400",
    APPROVED: "bg-green-400",
    SCHEDULED: "bg-purple-500",
    PUBLISHED: "bg-emerald-500",
    FAILED: "bg-red-400",
  };
  return dots[status] || dots.DRAFT;
};

/* ── Draggable Post Card ──────────────────────────────── */

function DraggablePostCard({
  post,
  compact,
}: {
  post: Post;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: post.id, data: { post } });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const title = post.title || post.content.substring(0, 40) || "Untitled";

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={style}
        className={`text-[10px] p-1 rounded border cursor-grab active:cursor-grabbing truncate transition-all
          ${isDragging ? "opacity-50 shadow-lg z-50 ring-2 ring-blue-400" : "hover:shadow-sm hover:border-gray-400"}
          ${statusColor(post.status)}`}
      >
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(post.status)}`} />
          <span className="font-medium truncate">{title}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`text-xs p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all
        ${isDragging ? "opacity-40 shadow-lg z-50 ring-2 ring-blue-400 scale-95" : "hover:shadow-md hover:border-gray-400"}
        ${statusColor(post.status)}`}
    >
      <div className="flex items-start gap-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${statusDot(post.status)}`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{title}</div>
          {post.format && (
            <span className="text-[10px] opacity-60">{post.format}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Droppable Day Cell ────────────────────────────────── */

function DroppableDayCell({
  date,
  posts,
  isToday: isTodayDate,
  isCurrentMonth,
  compact,
  label,
}: {
  date: Date;
  posts: Post[];
  isToday: boolean;
  isCurrentMonth?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: format(date, "yyyy-MM-dd"),
    data: { date },
  });

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        className={`border rounded min-h-[80px] p-1.5 transition-all
          ${!isCurrentMonth ? "bg-gray-50/50 text-gray-300" : ""}
          ${isTodayDate ? "border-gray-900 bg-gray-50" : "border-gray-200"}
          ${isOver ? "border-blue-400 bg-blue-50/50 shadow-inner ring-2 ring-blue-200" : ""}
        `}
      >
        <div
          className={`text-xs font-medium mb-1 ${
            isTodayDate ? "text-gray-900 font-bold" : ""
          }`}
        >
          {format(date, "d")}
        </div>
        {posts.slice(0, 3).map((post) => (
          <DraggablePostCard key={post.id} post={post} compact />
        ))}
        {posts.length > 3 && (
          <div className="text-[10px] text-gray-400 mt-0.5">
            +{posts.length - 3} more
          </div>
        )}
        {isOver && posts.length === 0 && (
          <div className="text-[10px] text-blue-400 mt-1 text-center">
            Drop here
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg min-h-[160px] p-2 transition-all
        ${isTodayDate ? "border-gray-900 bg-gray-50" : "border-gray-200"}
        ${isOver ? "border-blue-400 bg-blue-50/50 shadow-inner ring-2 ring-blue-200" : ""}
      `}
    >
      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center justify-between">
        <span>{label || format(date, "EEE MMM d")}</span>
        {isTodayDate && (
          <span className="bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            Today
          </span>
        )}
      </div>
      {posts.length === 0 ? (
        <div className={`text-xs mt-2 ${isOver ? "text-blue-400 font-medium" : "text-gray-300"}`}>
          {isOver ? "Drop here" : "No posts"}
        </div>
      ) : (
        <div className="space-y-1">
          {posts.map((post) => (
            <DraggablePostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Toast Notification ────────────────────────────────── */

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-gray-900 text-white",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 ${colors[type]}`}
    >
      {message}
    </div>
  );
}

/* ── Drag Overlay Card ─────────────────────────────────── */

function DragOverlayCard({ post }: { post: Post }) {
  const title = post.title || post.content.substring(0, 40) || "Untitled";
  return (
    <div className="text-xs p-2 rounded-lg border shadow-2xl bg-white ring-2 ring-blue-400 max-w-[200px] cursor-grabbing">
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(post.status)}`} />
        <span className="font-medium truncate">{title}</span>
      </div>
    </div>
  );
}

/* ── Main Calendar Page ────────────────────────────────── */

export default function CalendarPage() {
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.success) setPosts(data.data);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const getPostsForDate = (date: Date) => {
    return posts.filter((post) => {
      if (post.status === "PUBLISHED" || post.status === "FAILED") return false;
      if (post.scheduledAt && isSameDay(new Date(post.scheduledAt), date))
        return true;
      if (
        post.status === "DRAFT" ||
        post.status === "SAVED" ||
        post.status === "READY"
      ) {
        return isSameDay(new Date(post.createdAt), date);
      }
      return false;
    });
  };

  /* ── DnD Handlers ──────────────────────────── */

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const post = posts.find((p) => p.id === active.id);
    if (post) setActivePost(post);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActivePost(null);

    if (!over) return;

    const postId = active.id as string;
    const targetDateStr = over.id as string;

    // Find the target date from the droppable data
    const overData = over.data?.current;
    const targetDate: Date | undefined = overData?.date;

    if (!targetDate) {
      // Try parsing from the id format "yyyy-MM-dd"
      const parsed = new Date(targetDateStr);
      if (isNaN(parsed.getTime())) return;
    }

    const finalDate = targetDate || new Date(targetDateStr);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Don't reschedule published posts
    if (post.status === "PUBLISHED" || post.status === "FAILED") return;

    // Check if the date actually changed
    const currentDateVal = post.scheduledAt
      ? new Date(post.scheduledAt)
      : new Date(post.createdAt);

    if (isSameDay(currentDateVal, finalDate)) return; // No change

    setRescheduling(true);

    try {
      // Schedule at 09:00 in the default timezone for the target calendar date.
      const scheduledDate = zonedTimeToUtc(toDateKey(finalDate), "09:00", DEFAULT_SCHEDULE_TZ);

      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledDate.toISOString(),
          status: "SCHEDULED",
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Update local state
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  scheduledAt: scheduledDate.toISOString(),
                  scheduledAtUTC: scheduledDate.toISOString(),
                  status: "SCHEDULED",
                }
              : p
          )
        );

        const title = post.title || post.content.substring(0, 30) || "Post";
        setToast({
          message: `📅 "${title}" moved to ${format(finalDate, "MMM d, yyyy")}`,
          type: "success",
        });
      } else {
        setToast({
          message: data.error || "Failed to reschedule post",
          type: "error",
        });
      }
    } catch {
      setToast({
        message: "Network error — could not reschedule",
        type: "error",
      });
    } finally {
      setRescheduling(false);
    }
  }

  /* ── Calendar Calculations ──────────────────── */

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays: Date[] = [];
  let d = calendarStart;
  while (d <= calendarEnd) {
    calendarDays.push(d);
    d = addDays(d, 1);
  }

  /* ── Upcoming Posts List ──────────────────────── */

  const upcomingPosts = posts
    .filter(
      (p) =>
        p.status !== "PUBLISHED" &&
        p.status !== "FAILED" &&
        p.status !== "ARCHIVED"
    )
    .sort((a, b) => {
      const dateA = a.scheduledAt ? new Date(a.scheduledAt) : new Date(a.createdAt);
      const dateB = b.scheduledAt ? new Date(b.scheduledAt) : new Date(b.createdAt);
      return dateA.getTime() - dateB.getTime();
    });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Content Calendar</h1>
            <p className="text-gray-500 mt-1">
              Drag posts between days to reschedule
              {rescheduling && (
                <span className="ml-2 text-blue-600 animate-pulse">
                  Saving...
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <Button
                variant={view === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("week")}
                className="text-xs"
              >
                Week
              </Button>
              <Button
                variant={view === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("month")}
                className="text-xs"
              >
                Month
              </Button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              view === "week"
                ? setCurrentDate(subWeeks(currentDate, 1))
                : setCurrentDate(subMonths(currentDate, 1))
            }
          >
            ← Previous
          </Button>
          <h2 className="font-semibold">
            {view === "week"
              ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`
              : format(currentDate, "MMMM yyyy")}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              view === "week"
                ? setCurrentDate(addWeeks(currentDate, 1))
                : setCurrentDate(addMonths(currentDate, 1))
            }
          >
            Next →
          </Button>
        </div>

        {loading ? (
          <div className="text-gray-400 animate-pulse py-12 text-center">
            Loading calendar...
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Calendar Grid */}
            <div className="flex-1 min-w-0">
              {view === "week" ? (
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day) => (
                    <DroppableDayCell
                      key={day.toISOString()}
                      date={day}
                      posts={getPostsForDate(day)}
                      isToday={isToday(day)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (dayName) => (
                      <div
                        key={dayName}
                        className="text-xs font-medium text-gray-500 text-center py-2"
                      >
                        {dayName}
                      </div>
                    )
                  )}
                  {calendarDays.map((day) => (
                    <DroppableDayCell
                      key={day.toISOString()}
                      date={day}
                      posts={getPostsForDate(day)}
                      isToday={isToday(day)}
                      isCurrentMonth={
                        day.getMonth() === currentDate.getMonth()
                      }
                      compact
                    />
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="flex gap-4 mt-4 text-xs text-gray-500">
                {[
                  { label: "Draft", dot: "bg-gray-400" },
                  { label: "Ready", dot: "bg-amber-400" },
                  { label: "Scheduled", dot: "bg-purple-500" },
                  { label: "Published", dot: "bg-emerald-500" },
                ].map(({ label, dot }) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Sidebar: Upcoming Posts to Drag */}
            <div className="w-64 shrink-0 hidden lg:block">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 text-gray-700">
                    📋 Upcoming Posts
                  </h3>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Drag a post onto any calendar day to schedule it
                  </p>
                  {upcomingPosts.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">
                      No unscheduled posts.
                      <br />
                      <a
                        href="/create/ai-post"
                        className="text-blue-500 hover:underline"
                      >
                        Generate a post
                      </a>
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {upcomingPosts.map((post) => (
                        <DraggablePostCard key={post.id} post={post} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              <Card className="mt-4">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 text-gray-700">
                    📊 This Week
                  </h3>
                  <div className="space-y-2 text-xs">
                    {[
                      {
                        label: "Scheduled",
                        count: posts.filter(
                          (p) => p.status === "SCHEDULED"
                        ).length,
                        color: "text-purple-600",
                      },
                      {
                        label: "Drafts",
                        count: posts.filter(
                          (p) =>
                            p.status === "DRAFT" || p.status === "READY"
                        ).length,
                        color: "text-amber-600",
                      },
                      {
                        label: "Published",
                        count: posts.filter(
                          (p) => p.status === "PUBLISHED"
                        ).length,
                        color: "text-emerald-600",
                      },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-semibold ${color}`}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activePost ? <DragOverlayCard post={activePost} /> : null}
      </DragOverlay>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </DndContext>
  );
}
