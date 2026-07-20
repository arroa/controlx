export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-3 rounded-xl border-4 border-amber-400/80 bg-popover p-6 text-center shadow-lg">
        <h1 className="text-lg font-semibold">Registro cerrado</h1>
        <p className="text-sm text-muted-foreground">
          Los usuarios los crea un administrador desde ControlX. Si ya tienes
          acceso, inicia sesión.
        </p>
        <a
          href="/sign-in"
          className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ir a ingresar
        </a>
      </div>
    </main>
  );
}
