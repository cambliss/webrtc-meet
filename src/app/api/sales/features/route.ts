import { NextResponse } from "next/server";
import { getSalesContent } from "@/src/lib/salesFeatures";

/**
 * GET /api/sales/features?language=en
 *
 * Returns sales-friendly feature descriptions in requested language.
 * Useful for salespeople to download and share feature overviews.
 *
 * Query params:
 * - language: ISO language code (en, es, hi, or). Defaults to "en".
 * - includeIcons: boolean, default true. Include feature emoji icons.
 *
 * Response: SalesContent object with categories, features, and translations.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") || "en";
  const includeIcons = searchParams.get("includeIcons") !== "false";

  const salesContent = getSalesContent(language);

  // Filter features if icons not requested
  const response = includeIcons
    ? salesContent
    : {
        ...salesContent,
        categories: salesContent.categories.map((cat) => ({
          ...cat,
          features: cat.features.map((feature) => ({
            ...feature,
            icon: undefined,
          })),
        })),
      };

  return NextResponse.json(response, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
