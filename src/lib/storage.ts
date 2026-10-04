import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Two implementations behind one interface:
 *  - "local": writes to a private disk folder. Works on a VPS/Docker/
 *    always-on server. Does NOT persist across invocations on serverless
 *    platforms (Vercel) since each invocation gets a fresh filesystem.
 *  - "supabase": uses a private (non-public) Supabase Storage bucket with
 *    short-lived signed URLs for download — safe for serverless deployments.
 *
 * Select with STORAGE_PROVIDER=local|supabase. Callers only use
 * saveFile/getFile/deleteFile and never need to know which backend is active.
 */

const PROVIDER = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
const LOCAL_ROOT = process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), ".private-storage");

function randomKey(fileName: string) {
  const ext = path.extname(fileName);
  return `${crypto.randomBytes(24).toString("hex")}${ext}`;
}

function assertSafeKey(storageKey: string) {
  if (storageKey.includes("..") || storageKey.includes("\\")) {
    throw new Error("Invalid storage key");
  }
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Required when STORAGE_PROVIDER=supabase."
    );
  }
  return createClient(url, key);
}

async function saveFileLocal(buffer: Buffer, fileName: string): Promise<string> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
  const key = randomKey(fileName);
  const target = path.join(/*turbopackIgnore: true*/ LOCAL_ROOT, key);
  if (!target.startsWith(LOCAL_ROOT)) throw new Error("Invalid storage path");
  await fs.writeFile(target, buffer);
  return key;
}

async function saveFileSupabase(buffer: Buffer, fileName: string, mimeType?: string): Promise<string> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "agency-documents";
  const key = randomKey(fileName);
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return key;
}

export async function saveFile(buffer: Buffer, fileName: string, mimeType?: string): Promise<string> {
  if (PROVIDER === "supabase") return saveFileSupabase(buffer, fileName, mimeType);
  return saveFileLocal(buffer, fileName);
}

export async function getFile(storageKey: string): Promise<Buffer> {
  assertSafeKey(storageKey);
  if (PROVIDER === "supabase") {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "agency-documents";
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(bucket).download(storageKey);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "not found"}`);
    return Buffer.from(await data.arrayBuffer());
  }
  const target = path.join(/*turbopackIgnore: true*/ LOCAL_ROOT, storageKey);
  return fs.readFile(target);
}

/** Short-lived signed URL — used instead of a public link (spec section 21). */
export async function getSignedDownloadUrl(storageKey: string, expiresInSeconds = 300): Promise<string | null> {
  if (PROVIDER !== "supabase") return null; // local files are served via our own /api route instead
  assertSafeKey(storageKey);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "agency-documents";
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storageKey, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteFile(storageKey: string): Promise<void> {
  assertSafeKey(storageKey);
  if (PROVIDER === "supabase") {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "agency-documents";
    const supabase = getSupabaseClient();
    await supabase.storage.from(bucket).remove([storageKey]).catch(() => {});
    return;
  }
  const target = path.join(/*turbopackIgnore: true*/ LOCAL_ROOT, storageKey);
  await fs.unlink(target).catch(() => {});
}
