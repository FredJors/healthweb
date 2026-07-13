import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Kein schwebender Next.js-DevTools-Button ("N") unten links im Dev-Modus
  devIndicators: false,
  // Statischer Export: `npm run build` erzeugt out/ — lauffähig mit jedem
  // statischen Server (python -m http.server, Netlify, …). Möglich, weil die
  // App komplett clientseitig arbeitet (IndexedDB, keine API-Routen).
  output: "export",
  // /karte -> out/karte/index.html, damit einfache Server die Routen finden
  trailingSlash: true,
  images: { unoptimized: true },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Der Anthropic-SDK importiert node:fs/node:path für die (im Browser
      // ungenutzte) Profil-Authentifizierung — im Client-Bundle wegstubben.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:/,
          (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, "");
          }
        )
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
