import { NextResponse } from "next/server";
import { runTechAudit } from "@/lib/tech-audit";

export const maxDuration = 60; // Vercel: max 60s for hobby plan

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { domain, psiApiKey, runPageSpeed, sfUrls, sfTotalUrls } = body as {
      domain: string;
      psiApiKey?: string;
      runPageSpeed?: boolean;
      sfUrls?: string[];      // SF page URLs for robots.txt cross-reference
      sfTotalUrls?: number;   // Total SF URL count for sitemap comparison
    };

    if (!domain) {
      return NextResponse.json({ error: "domain не вказано" }, { status: 400 });
    }

    const result = await runTechAudit(domain, {
      psiApiKey,
      runPageSpeed: runPageSpeed ?? false,
      sfUrls: sfUrls ?? [],
      sfTotalUrls,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[tech-audit]", err);
    return NextResponse.json(
      { error: "Помилка технічного аудиту", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
