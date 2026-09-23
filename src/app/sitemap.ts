import type { MetadataRoute } from "next";

const SITE_URL = "https://studio-admin.arhamkhnz.com";

const PUBLIC_ROUTES = [
  "/",
  "/dashboard/default",
  "/dashboard/crm",
  "/dashboard/finance",
  "/dashboard/analytics",
  "/dashboard/productivity",
  "/auth/v1/login",
  "/auth/v1/register",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
  }));
}
