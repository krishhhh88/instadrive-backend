# DriveReel Backend (Next.js + Prisma)

This repository contains the DriveReel backend: Next.js API routes, NextAuth, Prisma schema,
and a cron endpoint designed for Vercel Cron. Configure environment variables in `.env`.

Key features:
- NextAuth (Google & Facebook/Instagram)
- Prisma schema for User, Account, Schedule, ContentQueue
- API routes: /api/schedule, /api/queue, /api/drive/files, /api/cron/run-jobs
- AES-GCM token encryption helper

Deployment:
1. Set environment variables in Vercel dashboard (see .env.example)
2. Deploy to Vercel
3. Run Prisma migrations with `npx prisma migrate deploy` or during CI.
