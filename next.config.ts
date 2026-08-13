import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "isomorphic-mermaid"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/svgdom/fonts/**/*",
      "./assets/fonts/**/*",
    ],
  },
  cacheComponents: true,
  cacheLife: {
    "published-content": {
      stale: 3_600,
      revalidate: 86_400,
      expire: 604_800,
    },
    "feed-index": {
      stale: 60,
      revalidate: 300,
      expire: 900,
    },
    negative: {
      stale: 0,
      revalidate: 60,
      expire: 300,
    },
  },
};

export default withNextIntl(nextConfig);
