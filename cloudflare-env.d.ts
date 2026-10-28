declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LINGQI_AUTH_SECRET?: string;
    RESEND_API_KEY?: string;
    LINGQI_MAIL_FROM?: string;
    LINGQI_SITE_URL?: string;
    BUCKET?: R2Bucket;
  }
}
