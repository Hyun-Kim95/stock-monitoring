import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config.js";
import {
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  getRequestAuth,
  getSessionCookieName,
  providerToEnum,
  revokeSession,
} from "../lib/auth-session.js";
import { logError } from "../lib/logger.js";

type Ctx = {
  prisma: PrismaClient;
  env: Env;
};

const stateStore = new Map<string, { provider: "google" | "kakao" | "naver"; next: string; expiresAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function cleanupStateStore() {
  const now = Date.now();
  for (const [k, v] of stateStore.entries()) {
    if (v.expiresAt <= now) stateStore.delete(k);
  }
}

function redirectUri(env: Env, provider: "google" | "kakao" | "naver") {
  return `${env.API_PUBLIC_BASE_URL}/auth/${provider}/callback`;
}

function appRedirectBase(env: Env): string {
  return env.WEB_PUBLIC_BASE_URL.replace(/\/+$/, "");
}

function failToWeb(env: Env, code: string) {
  return `${appRedirectBase(env)}/login?error=${encodeURIComponent(code)}`;
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, env } = ctx;

  app.get("/auth/me", async (request, reply) => {
    const auth = getRequestAuth(request);
    if (!auth) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } });
    }
    return { user: auth };
  });

  app.post("/auth/logout", async (request, reply) => {
    const cookieHeader = request.headers.cookie ?? "";
    const tokenPair = cookieHeader
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${getSessionCookieName()}=`));
    const token = tokenPair?.split("=")[1];
    if (token) {
      await revokeSession(prisma, decodeURIComponent(token));
    }
    reply.header("Set-Cookie", clearSessionCookie(env.NODE_ENV === "production"));
    return reply.status(204).send();
  });

  app.get("/auth/:provider/start", async (request, reply) => {
    const { provider } = request.params as { provider: "google" | "kakao" | "naver" };
    if (!["google", "kakao", "naver"].includes(provider)) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "지원하지 않는 provider" } });
    }
    cleanupStateStore();
    const q = request.query as { next?: string };
    const next = q.next?.startsWith("/") ? q.next : "/";
    const state = randomBytes(20).toString("hex");
    stateStore.set(state, { provider, next, expiresAt: Date.now() + STATE_TTL_MS });
    const redirect = redirectUri(env, provider);

    if (provider === "google") {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", env.OAUTH_GOOGLE_CLIENT_ID ?? "");
      url.searchParams.set("redirect_uri", redirect);
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    }
    if (provider === "kakao") {
      const url = new URL("https://kauth.kakao.com/oauth/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", env.OAUTH_KAKAO_CLIENT_ID ?? "");
      url.searchParams.set("redirect_uri", redirect);
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    }
    const url = new URL("https://nid.naver.com/oauth2.0/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.OAUTH_NAVER_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  app.get("/auth/:provider/callback", async (request, reply) => {
    const { provider } = request.params as { provider: "google" | "kakao" | "naver" };
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error) return reply.redirect(failToWeb(env, `oauth_${q.error}`));
    if (!q.code || !q.state) return reply.redirect(failToWeb(env, "oauth_invalid_callback"));
    const state = stateStore.get(q.state);
    stateStore.delete(q.state);
    if (!state || state.provider !== provider || state.expiresAt < Date.now()) {
      return reply.redirect(failToWeb(env, "oauth_state_invalid"));
    }

    try {
      const redirect = redirectUri(env, provider);
      let providerAccountId = "";
      let email = "";
      let name = "";
      let avatarUrl: string | undefined;

      if (provider === "google") {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: q.code,
            client_id: env.OAUTH_GOOGLE_CLIENT_ID ?? "",
            client_secret: env.OAUTH_GOOGLE_CLIENT_SECRET ?? "",
            redirect_uri: redirect,
          }),
        });
        const tokenBody = (await tokenRes.json()) as { access_token?: string };
        const accessToken = tokenBody.access_token;
        if (!accessToken) throw new Error("google access_token missing");
        const meRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const me = (await meRes.json()) as { sub?: string; email?: string; name?: string; picture?: string };
        providerAccountId = String(me.sub ?? "");
        email = String(me.email ?? "");
        name = String(me.name ?? "");
        avatarUrl = me.picture;
      } else if (provider === "kakao") {
        const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: q.code,
            client_id: env.OAUTH_KAKAO_CLIENT_ID ?? "",
            client_secret: env.OAUTH_KAKAO_CLIENT_SECRET ?? "",
            redirect_uri: redirect,
          }),
        });
        const tokenBody = (await tokenRes.json()) as { access_token?: string };
        const accessToken = tokenBody.access_token;
        if (!accessToken) throw new Error("kakao access_token missing");
        const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const me = (await meRes.json()) as {
          id?: number | string;
          kakao_account?: { email?: string; profile?: { nickname?: string; profile_image_url?: string } };
        };
        providerAccountId = String(me.id ?? "");
        email = String(me.kakao_account?.email ?? "");
        name = String(me.kakao_account?.profile?.nickname ?? "");
        avatarUrl = me.kakao_account?.profile?.profile_image_url;
      } else {
        const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
        tokenUrl.searchParams.set("grant_type", "authorization_code");
        tokenUrl.searchParams.set("client_id", env.OAUTH_NAVER_CLIENT_ID ?? "");
        tokenUrl.searchParams.set("client_secret", env.OAUTH_NAVER_CLIENT_SECRET ?? "");
        tokenUrl.searchParams.set("code", q.code);
        tokenUrl.searchParams.set("state", q.state);
        const tokenRes = await fetch(tokenUrl.toString());
        const tokenBody = (await tokenRes.json()) as { access_token?: string };
        const accessToken = tokenBody.access_token;
        if (!accessToken) throw new Error("naver access_token missing");
        const meRes = await fetch("https://openapi.naver.com/v1/nid/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const me = (await meRes.json()) as {
          response?: { id?: string; email?: string; name?: string; profile_image?: string };
        };
        providerAccountId = String(me.response?.id ?? "");
        email = String(me.response?.email ?? "");
        name = String(me.response?.name ?? "");
        avatarUrl = me.response?.profile_image;
      }

      if (!providerAccountId || !email) {
        throw new Error("oauth profile incomplete");
      }
      const providerEnum = providerToEnum(provider);
      const user = await prisma.$transaction(async (tx) => {
        const account = await tx.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: providerEnum,
              providerAccountId,
            },
          },
          include: { user: true },
        });
        if (account) {
          return tx.user.update({
            where: { id: account.userId },
            data: { email, displayName: name || account.user.displayName, avatarUrl: avatarUrl ?? account.user.avatarUrl },
          });
        }

        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          await tx.oAuthAccount.create({
            data: {
              userId: existing.id,
              provider: providerEnum,
              providerAccountId,
            },
          });
          return tx.user.update({
            where: { id: existing.id },
            data: { displayName: name || existing.displayName, avatarUrl: avatarUrl ?? existing.avatarUrl },
          });
        }

        const tenantName = `${name || email.split("@")[0]} Workspace`;
        return tx.user.create({
          data: {
            email,
            displayName: name || null,
            avatarUrl: avatarUrl ?? null,
            oauthAccounts: {
              create: {
                provider: providerEnum,
                providerAccountId,
              },
            },
            memberships: {
              create: {
                tenant: {
                  create: {
                    name: tenantName,
                    stocks: {
                      create: [
                        { code: "005930", name: "삼성전자" },
                        { code: "000660", name: "SK하이닉스" },
                      ],
                    },
                  },
                },
                role: "OWNER",
              },
            },
          },
        });
      });

      const { token } = await createSession(prisma, user.id);
      reply.header("Set-Cookie", buildSessionCookie(token, env.NODE_ENV === "production"));
      return reply.redirect(`${appRedirectBase(env)}${state.next}`);
    } catch (err) {
      const msg = String(err ?? "");
      logError("oauth callback failed", { provider, err: msg });
      if (msg.includes("oauth profile incomplete")) {
        return reply.redirect(failToWeb(env, "oauth_profile_incomplete"));
      }
      if (msg.includes("access_token missing")) {
        return reply.redirect(failToWeb(env, "oauth_token_missing"));
      }
      return reply.redirect(failToWeb(env, "oauth_failed"));
    }
  });
}
