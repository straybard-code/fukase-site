const TARGET_EMAIL = "support@send.fukase-lab.com";
const DEFAULT_FROM = "釣り羅針盤 <support@send.fukase-lab.com>";
const ALLOWED_CATEGORIES = new Set([
  "ご意見",
  "ご要望",
  "ご感想",
  "不具合・使いにくかった点",
  "作者への激励",
  "その他",
]);

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 15 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

const rateState = globalThis.__fukaseFeedbackRateState || (globalThis.__fukaseFeedbackRateState = new Map());

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback") {
      return handleFeedback(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse(
        { ok: false, message: "Not found" },
        404,
      );
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleFeedback(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(
      { ok: false, message: "Method not allowed" },
      405,
      { Allow: "POST" },
    );
  }

  const payload = await readPayload(request);
  if (!payload) {
    return jsonResponse(
      { ok: false, message: "Invalid request" },
      400,
    );
  }

  const validation = validateFeedbackPayload(payload);
  if (!validation.ok) {
    return jsonResponse(
      {
        ok: false,
        message: "入力内容をご確認ください。",
        fieldErrors: validation.fieldErrors,
      },
      400,
    );
  }

  const clientKey = buildClientKey(request);
  if (!allowSubmission(clientKey)) {
    return jsonResponse(
      {
        ok: false,
        message: "メッセージを送信できませんでした。時間をおいて、もう一度お試しください。",
      },
      429,
    );
  }

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        message: "メッセージを送信できませんでした。時間をおいて、もう一度お試しください。",
      },
      500,
    );
  }

  const name = normalizeText(payload.name);
  const email = normalizeText(payload.email);
  const category = normalizeText(payload.category) || "ご感想";
  const message = normalizeMessage(payload.message);
  const sourcePage = normalizeText(payload.sourcePage || payload.source_page || request.headers.get("referer")) || new URL("/beta/register/", request.url).toString();
  const pageVersion = normalizeText(payload.pageVersion || payload.page_version) || "beta-register";
  const browser = normalizeText(payload.browser || request.headers.get("user-agent")) || "未取得";
  const submittedAt = normalizeText(payload.submittedAt) || new Date().toISOString();
  const timestampJst = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(new Date());

  const textBody = buildTextBody({
    name,
    email,
    category,
    message,
    sourcePage,
    pageVersion,
    browser,
    submittedAt,
    timestampJst,
  });

  const htmlBody = buildHtmlBody({
    name,
    email,
    category,
    message,
    sourcePage,
    pageVersion,
    browser,
    submittedAt,
    timestampJst,
  });

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: env.FEEDBACK_FROM_EMAIL || DEFAULT_FROM,
      to: [TARGET_EMAIL],
      subject: `【釣り羅針盤】${category}`,
      text: textBody,
      html: htmlBody,
      ...(email ? { reply_to: email } : {}),
    }),
  });

  if (!resendResponse.ok) {
    return jsonResponse(
      {
        ok: false,
        message: "メッセージを送信できませんでした。時間をおいて、もう一度お試しください。",
      },
      502,
    );
  }

  return jsonResponse({
    ok: true,
  });
}

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = await request.json();
      return isPlainObject(data) ? data : null;
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      return Object.fromEntries(formData.entries());
    }
  } catch {
    return null;
  }

  return null;
}

function validateFeedbackPayload(payload) {
  const fieldErrors = {};

  const name = normalizeText(payload.name);
  const email = normalizeText(payload.email);
  const category = normalizeText(payload.category);
  const message = normalizeMessage(payload.message);
  const company = normalizeText(payload.company);
  const startedAtRaw = normalizeText(payload.formStartedAt || payload.started_at);
  const startedAtMs = Date.parse(startedAtRaw);

  if (company) {
    return {
      ok: false,
      fieldErrors: {},
    };
  }

  if (name.length > 100) {
    fieldErrors.name = "お名前は100文字以内で入力してください。";
  }

  if (email.length > 254) {
    fieldErrors.email = "メールアドレスは254文字以内で入力してください。";
  } else if (email && !isValidEmail(email)) {
    fieldErrors.email = "メールアドレスの形式を確認してください。";
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    fieldErrors.category = "メッセージの種類を選択してください。";
  }

  if (!message) {
    fieldErrors.message = "メッセージを入力してください。";
  } else if (message.length > 2000) {
    fieldErrors.message = "メッセージは2000文字以内で入力してください。";
  }

  if (!Number.isFinite(startedAtMs) || Date.now() - startedAtMs < 1000) {
    return {
      ok: false,
      fieldErrors: {},
    };
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

function allowSubmission(clientKey) {
  const now = Date.now();
  const previous = rateState.get(clientKey) || [];
  const recent = previous.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);

  if (recent.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    rateState.set(clientKey, recent);
    return false;
  }

  if (recent.length > 0 && now - recent[recent.length - 1] < MIN_GAP_MS) {
    rateState.set(clientKey, recent);
    return false;
  }

  recent.push(now);
  rateState.set(clientKey, recent);
  return true;
}

function buildClientKey(request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) {
    return ip;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
}

function normalizeMessage(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function buildTextBody(data) {
  return [
    "釣り羅針盤へのご意見・ご要望",
    "",
    `メッセージ種別: ${data.category || "未入力"}`,
    `お名前: ${data.name || "未入力"}`,
    `メールアドレス: ${data.email || "未入力"}`,
    `メッセージ本文:`,
    data.message || "未入力",
    "",
    `送信日時: ${data.timestampJst}`,
    `送信元ページ: ${data.sourcePage}`,
    `LPバージョン: ${data.pageVersion}`,
    `送信記録時刻: ${data.submittedAt}`,
    `ブラウザ情報: ${data.browser}`,
  ].join("\n");
}

function buildHtmlBody(data) {
  const messageHtml = escapeHtml(data.message || "未入力").replace(/\n/g, "<br>");

  return `<!doctype html>
  <html lang="ja">
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;line-height:1.7;color:#0a2230;background:#f7fcff;padding:24px">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d6eef6;border-radius:16px;padding:24px">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">釣り羅針盤へのご意見・ご要望</h1>
        <table role="presentation" style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;font-weight:700;width:130px;vertical-align:top">メッセージ種別</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.category || "未入力")}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">お名前</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.name || "未入力")}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">メールアドレス</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.email || "未入力")}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">メッセージ本文</td><td style="padding:8px 0;vertical-align:top">${messageHtml}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">送信日時</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.timestampJst)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">送信元ページ</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.sourcePage)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">LPバージョン</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.pageVersion)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">送信記録時刻</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.submittedAt)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;vertical-align:top">ブラウザ情報</td><td style="padding:8px 0;vertical-align:top">${escapeHtml(data.browser)}</td></tr>
        </table>
      </div>
    </body>
  </html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
