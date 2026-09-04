import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/get-session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    return Response.json(session);
  } catch {
    return Response.json(null);
  }
}
