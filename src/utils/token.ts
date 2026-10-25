import crypto from "crypto";

const SECRET = process.env.SUPABASE_ANON_KEY || "nexpill-auth-secret-key-2026";

export interface TokenPayload {
  id: string;
  email: string;
  exp: number;
}

export function createNexPillToken(userId: string, email: string): string {
  const payload: TokenPayload = {
    id: userId,
    email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(b64Payload)
    .digest("base64url");
  return `nx_${b64Payload}.${signature}`;
}

export function verifyNexPillToken(token: string): TokenPayload | null {
  if (!token.startsWith("nx_")) return null;
  const parts = token.slice(3).split(".");
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SECRET)
    .update(b64Payload)
    .digest("base64url");

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(b64Payload, "base64url").toString("utf8"),
    ) as TokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
