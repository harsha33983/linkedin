import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireAuthFromRequest } from "@/lib/auth/get-session";
import { handleApiError, ValidationError } from "@/lib/errors/api-errors";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * POST /api/uploads/image
 *
 * Stores a user-provided cover image under public/uploads and returns the
 * absolute URL (imageUrl) that gets attached to a post. The file is served
 * as a static asset; the publishing service downloads it from this URL when
 * uploading to LinkedIn.
 *
 * Body: multipart/form-data with a single `file` field.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuthFromRequest(request as any);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Could not read the uploaded file.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("Please attach an image file.");
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      throw new ValidationError(
        "Only JPG, PNG, WEBP or GIF images are supported."
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("Image is too large (max 5 MB).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      throw new ValidationError("The uploaded image is empty.");
    }

    const filename = `${userId.slice(0, 8)}_${randomUUID()}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin
    ).replace(/\/$/, "");

    return Response.json({
      success: true,
      url: `${baseUrl}/uploads/${filename}`,
      filename,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
