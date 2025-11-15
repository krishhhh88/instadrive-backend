import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth-options";
import { prisma } from "../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }});
  if (!user) return res.status(401).json({ error: "No user" });

  if (req.method === "GET") {
    const rows = await prisma.schedule.findMany({ where: { userId: user.id }});
    const out: Record<string, { enabled: boolean; times: string[] }> = {
      Sunday: { enabled: false, times: [] },
      Monday: { enabled: false, times: [] },
      Tuesday: { enabled: false, times: [] },
      Wednesday: { enabled: false, times: [] },
      Thursday: { enabled: false, times: [] },
      Friday: { enabled: false, times: [] },
      Saturday: { enabled: false, times: [] },
    };
    for (const r of rows) {
      const name = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][r.dayOfWeek];
      out[name].enabled = true;
      out[name].times.push(r.time);
    }
    return res.json(out);
  }

  if (req.method === "POST") {
    const body = req.body as Record<string, { enabled: boolean; times: string[] }>;
    await prisma.schedule.deleteMany({ where: { userId: user.id }});
    const inserts = [];
    const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    for (let d=0; d<7; d++) {
      const s = body[DAYS[d]];
      if (s && s.enabled && s.times?.length) {
        for (const time of s.times) {
          let t = time;
          if (/^\d{2}:\d{2}$/.test(time)) t = `${time}:00`;
          inserts.push({ userId: user.id, dayOfWeek: d, time: t });
        }
      }
    }
    if (inserts.length) await prisma.schedule.createMany({ data: inserts });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
