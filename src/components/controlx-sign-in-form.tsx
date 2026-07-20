"use client";

import { useAuth } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useSignIn } from "@clerk/nextjs/legacy";
import type { SignInResource } from "@clerk/shared/types";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "email" | "code";

type ClerkSignInFormInnerProps = {
  signIn: SignInResource;
  setActive: (params: { session: string | null }) => Promise<void>;
  destination: string;
};

function normalizeIdentifier(email: string) {
  return email.trim().toLowerCase();
}

function ClerkSignInFormInner({
  signIn,
  setActive,
  destination,
}: ClerkSignInFormInnerProps) {
  const { isSignedIn, signOut } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function finishSignIn(sessionId: string) {
    setLoading(true);
    await setActive({ session: sessionId });
    // Navegación completa: asegura cookie de sesión antes de resolver el destino.
    window.location.assign(destination);
  }

  async function clearClerkState() {
    if (isSignedIn || signIn.status) {
      await signOut();
    }
  }

  async function startSignIn(
    identifier: string,
    retry = false,
  ): Promise<SignInResource> {
    const normalized = normalizeIdentifier(identifier);

    if (
      signIn.status === "needs_first_factor" &&
      signIn.identifier?.toLowerCase() === normalized
    ) {
      return signIn;
    }

    if (!retry && (isSignedIn || signIn.status)) {
      await clearClerkState();
    }

    try {
      return await signIn.create({ identifier: normalized });
    } catch (err) {
      if (!retry && isClerkAPIResponseError(err)) {
        const clerkCode = err.errors[0]?.code;
        if (clerkCode === "session_exists" || err.status === 409) {
          await clearClerkState();
          return startSignIn(identifier, true);
        }
      }
      throw err;
    }
  }

  async function prepareEmailCode(result: SignInResource) {
    if (result.status === "complete" && result.createdSessionId) {
      await finishSignIn(result.createdSessionId);
      return;
    }

    if (result.status !== "needs_first_factor") {
      setError("No se pudo iniciar el inicio de sesión. Intenta de nuevo.");
      return;
    }

    const emailFactor = result.supportedFirstFactors?.find(
      (factor) => factor.strategy === "email_code",
    );

    if (!emailFactor || !("emailAddressId" in emailFactor)) {
      const hasPassword = result.supportedFirstFactors?.some(
        (factor) => factor.strategy === "password",
      );
      setError(
        hasPassword
          ? "Clerk tiene solo contraseña activa. En el dashboard activa Email verification code."
          : "El código por email no está habilitado en Clerk.",
      );
      return;
    }

    await signIn.prepareFirstFactor({
      strategy: "email_code",
      emailAddressId: emailFactor.emailAddressId,
    });

    setStep("code");
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await startSignIn(email);
      await prepareEmailCode(result);
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ??
            err.errors[0]?.message ??
            "Error al iniciar sesión",
        );
      } else {
        setError("Error inesperado. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code.trim(),
      });

      if (result.status === "complete" && result.createdSessionId) {
        await finishSignIn(result.createdSessionId);
        return;
      }

      setError("Código inválido o expirado.");
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ??
            err.errors[0]?.message ??
            "Código inválido",
        );
      } else {
        setError("Error al verificar el código.");
      }
    } finally {
      setLoading(false);
    }
  }

  return step === "email" ? (
    <form className="space-y-4" onSubmit={handleEmailSubmit}>
      <div className="space-y-2">
        <Label htmlFor="clerk-access-email">Correo electrónico</Label>
        <Input
          id="clerk-access-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nombre@empresa.com"
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
      <Button className="w-full" type="submit" disabled={loading}>
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Verificando…
          </>
        ) : (
          "Continuar"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Te enviaremos un código por email. Solo usuarios autorizados.
      </p>
    </form>
  ) : (
    <form className="space-y-4" onSubmit={handleCodeSubmit}>
      <div className="space-y-2">
        <Label htmlFor="clerk-access-code">Código de verificación</Label>
        <Input
          id="clerk-access-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={6}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="text-center text-2xl tracking-[0.35em]"
          placeholder="000000"
        />
        <p className="text-xs text-muted-foreground">
          Código enviado a {email}
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        type="submit"
        disabled={loading || code.length < 6}
      >
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Verificando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setStep("email");
          setCode("");
          setError("");
          void clearClerkState();
        }}
      >
        Usar otro email
      </Button>
    </form>
  );
}

function ClerkSignInForm({ destination }: { destination: string }) {
  const { signIn, isLoaded, setActive } = useSignIn();

  if (!isLoaded || !signIn || !setActive) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  return (
    <ClerkSignInFormInner
      signIn={signIn}
      setActive={setActive}
      destination={destination}
    />
  );
}

type ControlXSignInFormProps = {
  destination?: string;
};

/** Formulario OTP custom (mismo patrón que Xpaces). Requiere ClerkProvider. */
export function ControlXSignInForm({
  destination = "/entrar",
}: ControlXSignInFormProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  return <ClerkSignInForm destination={destination} />;
}
