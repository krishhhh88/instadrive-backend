import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth-options";
import { prisma } from "../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }});
  if (!user) return res.status(401).json({ error: "No user" });

  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  if (req.method === "DELETE") {
    await prisma.contentQueue.deleteMany({ where: { id, userId: user.id }});
    return res.json({ success: true });
  }
  return res.status(405).json({ error: "method not allowed" });
}
