import { ProfileEditor } from "@/components/ProfileEditor";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Éditer mon profil — Nova Compagnie" };

export default async function ProfileEditPage() {
  await requireUser("/compte/profil");

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <ProfileEditor />
    </div>
  );
}
