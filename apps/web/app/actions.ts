"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { decide, startStory, moveInQueue, setExcluded, retryJob, ConflictError, type ReviewAction } from "@storyforge/core/services";
import { TransitionError } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_S, signSession, verifySession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

async function requireAdmin() {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
}

export type ActionState = { ok: boolean; message: string } | null;

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = String(form.get("user") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const okUser = user === (process.env.ADMIN_USER ?? "admin");
  // verificăm parola chiar dacă userul e greșit, ca timpul de răspuns să nu-l trădeze
  const okPass = verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
  if (!okUser || !okPass) return { ok: false, message: "Utilizator sau parolă greșită" };
  (await cookies()).set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

function errMessage(e: unknown) {
  if (e instanceof TransitionError || e instanceof ConflictError) return e.message;
  console.error(e);
  return "Eroare neașteptată";
}

export async function decideAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const storyId = String(form.get("storyId"));
  const action = String(form.get("action")) as ReviewAction;
  const comment = String(form.get("comment") ?? "");
  if (!["APPROVE", "REQUEST_CHANGES", "REJECT"].includes(action)) return { ok: false, message: "Acțiune necunoscută" };
  if (action === "REQUEST_CHANGES" && comment.trim().length < 3)
    return { ok: false, message: "Comentariul e obligatoriu la „Cere modificări”" };
  let next: string;
  try {
    next = (await decide(prisma, storyId, action, comment)).next;
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath(`/stories/${storyId}`);
  revalidatePath("/");
  // Formularul dispare după decizie (povestea iese din review), deci confirmarea vine ca mesaj în URL.
  const msg = action === "APPROVE" ? "Aprobat" : action === "REQUEST_CHANGES" ? "Trimis la refacere" : "Respins";
  redirect(`/stories/${storyId}?flash=${encodeURIComponent(`${msg} → ${next}`)}`);
}

export async function startAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("storyId"));
  await startStory(prisma, id);
  revalidatePath("/");
  revalidatePath(`/stories/${id}`);
}

export async function moveAction(form: FormData) {
  await requireAdmin();
  await moveInQueue(prisma, String(form.get("storyId")), form.get("dir") === "up" ? "up" : "down");
  revalidatePath("/");
}

export async function excludeAction(form: FormData) {
  await requireAdmin();
  await setExcluded(prisma, String(form.get("storyId")), form.get("excluded") === "1");
  revalidatePath("/");
}

export async function retryJobAction(form: FormData) {
  await requireAdmin();
  await retryJob(prisma, String(form.get("jobId")));
  revalidatePath("/");
  const sid = form.get("storyId");
  if (sid) revalidatePath(`/stories/${sid}`);
}
