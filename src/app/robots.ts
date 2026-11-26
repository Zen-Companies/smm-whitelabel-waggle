import type { MetadataRoute } from "next";
import { appRobots } from "@/lib/seo";

// The app is never in search; gowaggle.ai is the public site.
export default function robots(): MetadataRoute.Robots {
  return appRobots();
}
