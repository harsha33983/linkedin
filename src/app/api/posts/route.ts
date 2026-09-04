import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError } from "@/lib/errors/api-errors";
import { z } from "zod";

const createPostSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
  topic: z.string().optional(),
  format: z.string().optional(),
  status: z.enum(["DRAFT", "SAVED"]).default("DRAFT"),
  voiceDnaVersionUsed: z.number().optional(),
  scheduledAt: z.string().optional(),
  imageUrl: z.string().optional(),
});

/**
 * GET /api/posts — List all posts with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") as string | null;
    const topic = searchParams.get("topic");
    const format = searchParams.get("format");
    const search = searchParams.get("search");

    // posts timestamps are naive `timestamp without time zone` columns storing
    // UTC wall-clock. Select explicit columns and format each timestamp as a
    // UTC ISO string (…Z) so clients parse the same instant on every session
    // timezone the Neon pooler may assign.
    const TS = `to_char((p."scheduledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    let queryStr = `SELECT
        p.id, p."userId", p.title, p.content, p.topic, p.format, p.status,
        p."queuePosition",
        ${TS} AS "scheduledAt",
        to_char((p."scheduledAtUTC" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAtUTC",
        p."scheduledTimezone",
        to_char((p."publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",
        p."externalPostId", p."publishingProvider", p."publishingResponse",
        p."voiceDnaVersionUsed", p."imageUrl",
        to_char((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
        to_char((p."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"
      FROM posts p
      WHERE p."userId" = $1`;
    const params: any[] = [userId];
    let pIdx = 2;

    if (status) { queryStr += ` AND p.status = $${pIdx++}`; params.push(status); }
    if (topic) { queryStr += ` AND p.topic = $${pIdx++}`; params.push(topic); }
    if (format) { queryStr += ` AND p.format = $${pIdx++}`; params.push(format); }
    if (search) { 
      queryStr += ` AND (p.title ILIKE $${pIdx} OR p.content ILIKE $${pIdx})`; 
      params.push(`%${search}%`);
      pIdx++;
    }
    
    queryStr += ` ORDER BY p."updatedAt" DESC`;
    const posts = await (sql as any).query(queryStr, params);

    return Response.json({
      success: true,
      data: posts,
      total: posts.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/posts — Create a new post
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);
    const body = await request.json();
    const parsed = createPostSchema.parse(body);

    // Bind the UTC wall-clock text (not a JS Date) so the naive timestamp
    // column stores the same value on every session timezone.
    let scheduledAt: string | null = null;
    if (parsed.scheduledAt) {
      const utcIso = new Date(parsed.scheduledAt).toISOString();
      scheduledAt = utcIso.slice(0, 19).replace("T", " ");
    }

    const [post] = await sql`
      INSERT INTO posts (
        id, "userId", title, content, topic, format, status, "voiceDnaVersionUsed", "scheduledAt", "imageUrl", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${parsed.title || null}, ${parsed.content}, 
        ${parsed.topic || null}, ${parsed.format || null}, ${parsed.status}, 
        ${parsed.voiceDnaVersionUsed || null}, ${scheduledAt},
        ${parsed.imageUrl || null}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      )
      RETURNING *
    `;

    return Response.json(
      { success: true, data: post },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
