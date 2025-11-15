import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth-options";
import { prisma } from "../../lib/prisma";
import { decrypt } from "../../lib/crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }});
  if (!user) return res.status(401).json({ error: "No user" });
  const acc = await prisma.account.findFirst({ where: { userId: user.id, provider: "google" }});
  if (!acc || !acc.access_token_enc) return res.status(400).json({ error: "Google not connected" });
  try {
    const access = decrypt(acc.access_token_enc);
    const q = encodeURIComponent("mimeType contains 'video/'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&fields=files(id,name,mimeType,thumbnailLink,modifiedTime,videoMediaMetadata)`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${access}` }});
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: txt });
    }
    const data = await resp.json();
    return res.json({ files: data.files ?? [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "drive list failed" });
  }
}
