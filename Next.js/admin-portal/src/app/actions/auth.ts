"use server";

import { redirect } from "next/navigation";
import { AuthError, loginDemoUser, logoutDemoUser } from "@/lib/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const emailValue = formData.get("email");
  const codeValue = formData.get("accessCode");
  if (typeof emailValue !== "string" || typeof codeValue !== "string" || !emailValue.trim() || !codeValue || emailValue.length > 254 || codeValue.length > 256) {
    redirect("/login?error=invalid");
  }
  try {
    await loginDemoUser(emailValue, codeValue);
  } catch (error) {
    if (error instanceof AuthError && error.code === "configuration") {
      redirect("/login?error=configuration");
    }
    if (error instanceof AuthError && error.code === "unauthenticated") {
      redirect("/login?error=invalid");
    }
    // Avoid misreporting cookie/runtime failures as invalid credentials.
    console.error("Demo sign-in could not create a session.");
    redirect("/login?error=unavailable");
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await logoutDemoUser();
  redirect("/login");
}
