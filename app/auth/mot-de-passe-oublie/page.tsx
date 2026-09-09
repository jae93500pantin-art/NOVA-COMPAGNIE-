import { PasswordResetForm } from "@/components/PasswordResetForm";

export const metadata = {
  title: "Mot de passe oublié — Nova Compagnie",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return <PasswordResetForm />;
}
