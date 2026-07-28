import { ProfileEditor } from "@/components/ProfileEditor";

export const metadata = { title: "Éditer mon profil — Nova Compagnie" };

export default function ProfileEditPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <ProfileEditor />
    </div>
  );
}
