import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="login panel">
      <h1>StoryForge</h1>
      <LoginForm next={next ?? "/"} />
    </div>
  );
}
