import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  ensureClerkUser,
  formatClerkError,
  normalizeEmail,
} from "../src/lib/clerk-users";

async function setupAdmin() {
  const rawEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!rawEmail?.trim()) {
    throw new Error("Define SUPER_ADMIN_EMAIL en .env.local");
  }

  const email = normalizeEmail(rawEmail);

  console.log("→ Creando / sincronizando super admin en Clerk…");
  const clerkUserId = await ensureClerkUser(email, { forceClerk: true });
  console.log("  Identidad OK:", clerkUserId);
  console.log("  email:", email);
  console.log("");
  console.log(
    "Listo. Inicia sesión con ese email (OTP de Clerk). El acceso SuperAdmin",
  );
  console.log("lo da SUPER_ADMIN_EMAIL en el entorno (no hace falta fila Mongo).");

  process.exit(0);
}

setupAdmin().catch((error) => {
  console.error("setup:admin falló:", formatClerkError(error));
  process.exit(1);
});
