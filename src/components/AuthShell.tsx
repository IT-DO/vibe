// Единая обёртка для страниц входа/регистрации/сброса пароля — приподнятая
// карточка на мягком градиентном фоне вместо формы, просто плавающей на
// пустом сером фоне. Использует те же токены, что и hero на главной.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell flex min-h-[75vh] items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-orange-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-[-10%] h-72 w-72 rounded-full bg-amber-100/60 blur-3xl"
      />
      <div className="auth-card">{children}</div>
    </div>
  );
}
