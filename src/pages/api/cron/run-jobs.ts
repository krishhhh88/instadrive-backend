import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { decrypt, encrypt } from "../../lib/crypto";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";

const CRON_SECRET = process.env.VERCEL_CRON_SECRET;

async function ensureAccessTokenForAccount(account) {
  if (!account) return null;
  let access = account.access_token_enc ? decrypt(account.access_token_enc) : null;
  const expires = account.token_expires_at ?? 0;
  const now = Math.floor(Date.now()/1000);
  if (!access || (expires && expires < now + 60)) {
    if (!account.refresh_token_enc) return null;
    const refresh = decrypt(account.refresh_token_enc);
    if (account.provider === "google") {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refresh,
          grant_type: "refresh_token"
        } as any)
      });
      const data = await resp.json();
      if (data.error) throw new Error(JSON.stringify(data));
      access = data.access_token;
      const expiresAt = Math.floor(Date.now()/1000) + (data.expires_in ?? 3600);
      await prisma.account.update({ where: { id: account.id }, data: { access_token_enc: encrypt(access), token_expires_at: expiresAt }});
    } else if (account.provider === "facebook") {
      const resp = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${refresh}`);
      const data = await resp.json();
      if (data.error) throw new Error(JSON.stringify(data));
      access = data.access_token;
      const expiresAt = data.expires_in ? Math.floor(Date.now()/1000) + data.expires_in : null;
      await prisma.account.update({ where: { id: account.id }, data: { access_token_enc: encrypt(access), token_expires_at: expiresAt }});
    } else {
      throw new Error("unsupported provider");
    }
  }
  return access;
}

async function downloadDriveFile(accessToken, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`drive download failed: ${resp.status} ${txt}`);
  }
  const tmpPath = path.join(tmpdir(), `${fileId}-${Date.now()}`);
  const dest = fs.createWriteStream(tmpPath);
  return new Promise((resolve, reject) => {
    resp.body.pipe(dest);
    resp.body.on("error", err => reject(err));
    dest.on("finish", () => resolve(tmpPath));
  });
}

async function postVideoToInstagram(accessToken, videoPath, caption) {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!igUserId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID not set");
  const FormData = require("form-data");
  const fd = new FormData();
  fd.append("media_type", "VIDEO");
  fd.append("video_file", fs.createReadStream(videoPath));
  if (caption) fd.append("caption", caption);
  const containerResp = await fetch(`https://graph.facebook.com/v16.0/${igUserId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd
  });
  const containerData = await containerResp.json();
  if (!containerResp.ok) throw new Error(JSON.stringify(containerData));
  const containerId = containerData.id;
  const publishResp = await fetch(`https://graph.facebook.com/v16.0/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${accessToken}` },
    body: new URLSearchParams({ creation_id: containerId })
  });
  const publishData = await publishResp.json();
  if (!publishResp.ok) throw new Error(JSON.stringify(publishData));
  return publishData;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const header = req.headers["x-vercel-cron"] || req.headers["authorization"] || req.headers["x-cron-secret"];
  const token = typeof header === "string" ? (header.startsWith("Bearer ") ? header.slice(7) : header) : Array.isArray(header) ? header[0] : "";
  if (!token || token !== CRON_SECRET) return res.status(403).json({ error: "forbidden" });

  const now = new Date();
  const dow = now.getUTCDay();
  const hh = String(now.getUTCHours()).padStart(2,"0");
  const mm = String(now.getUTCMinutes()).padStart(2,"0");
  const timeStr = `${hh}:${mm}:00`;

  try {
    const scheds = await prisma.schedule.findMany({ where: { dayOfWeek: dow, time: timeStr }});
    if (!scheds.length) return res.json({ ok: true, processed: 0 });
    let processed = 0;
    for (const s of scheds) {
      const userId = s.userId;
      const item = await prisma.contentQueue.findFirst({ where: { userId, status: "queued" }, orderBy: [{ postOrder: "asc" }, { createdAt: "asc" }]});
      if (!item) continue;
      const googleAcc = await prisma.account.findFirst({ where: { userId, provider: "google" }});
      const fbAcc = await prisma.account.findFirst({ where: { userId, provider: "facebook" }});
      if (!googleAcc || !fbAcc) {
        await prisma.contentQueue.update({ where: { id: item.id }, data: { status: "failed", errorMessage: "missing accounts" }});
        continue;
      }
      try {
        const googleAccess = await ensureAccessTokenForAccount(googleAcc);
        const fbAccess = await ensureAccessTokenForAccount(fbAcc);
        if (!googleAccess || !fbAccess) throw new Error("unable to get tokens");
        const filePath = await downloadDriveFile(googleAccess, item.googleDriveFileId);
        const publish = await postVideoToInstagram(fbAccess, filePath, item.caption ?? "");
        await prisma.contentQueue.update({ where: { id: item.id }, data: { status: "posted", errorMessage: null }});
        processed += 1;
        try { fs.unlinkSync(filePath); } catch(e){}
      } catch (err) {
        console.error("job error", err);
        await prisma.contentQueue.update({ where: { id: item.id }, data: { status: "failed", errorMessage: String(err).slice(0,1000) }});
      }
    }
    return res.json({ ok: true, processed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "cron failed", details: String(err) });
  }
}
