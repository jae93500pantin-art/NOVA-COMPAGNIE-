import { AccountDashboard } from "@/components/AccountDashboard";

export const metadata = { title: "Mon espace — Nova Compagnie" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <AccountDashboard />
    </div>
  );
}
