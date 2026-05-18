import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  if (process.env.AUTH_PROXY_ENABLED === "false") {
    redirect("/home");
  }

  const cookieStore = await cookies();
  redirect(cookieStore.has("access_token") ? "/home" : "/login");
}
