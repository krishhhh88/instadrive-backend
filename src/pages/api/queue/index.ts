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
    const queue = await prisma.contentQueue.findMany({ where: { userId: user.id }, orderBy: { postOrder: "asc" }});
    return res.json({ queue });
  }

  if (req.method === "POST") {
    const { googleDriveFileId, caption } = req.body;
    if (!googleDriveFileId) return res.status(400).json({ error: "missing file id" });
    const max = await prisma.contentQueue.aggregate({ where: { userId: user.id }, _max: { postOrder: true }});
    const nextOrder = (max._max.postOrder ?? 0) + 1;
    const created = await prisma.contentQueue.create({
      data: { userId: user.id, googleDriveFileId, caption, postOrder: nextOrder }
    });
    return res.status(201).json({ item: created });
  }

  return res.status(405).json({ error: "method not allowed" });
}
