import { AccountDashboard } from "@/components/AccountDashboard";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Mon espace — Nova Compagnie" };

export default async function AccountPage() {
  // Middleware already turns anonymous visitors away; this is the second lock,
  // so a matcher change can never quietly expose the page. No-op in demo mode.
  await requireUser("/compte");

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <AccountDashboard />
    </div>
  );
}
