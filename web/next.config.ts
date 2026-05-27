import type { NextConfig } from "next";

// Безопасные HTTP-заголовки, применяются ко всем ответам.
const securityHeaders = [
  // HSTS — браузер запоминает, что сайт только HTTPS, на 1 год
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Запрет embedded-iframe (защита от clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Запрет MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Минимальный referrer в кросс-сайтовых запросах
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Базовый CSP: разрешаем только наш origin, Supabase API, и шрифты от Google если будут.
  // Для inline-стилей (Tailwind hash) разрешаем 'unsafe-inline' — типично для Next.js SSR.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next inline + React runtime
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // Запрет автоматических геолок./микрофона/камеры — не используем
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  // Не показывать "Powered by Next.js" в заголовках — мелочь, но снижает fingerprinting
  poweredByHeader: false,
};

export default nextConfig;
