import Header from "@/components/Header";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-5xl justify-center px-5 py-20">
        <AuthForm mode="login" />
      </main>
    </>
  );
}
