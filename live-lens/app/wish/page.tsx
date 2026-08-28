import { getSettingsAction } from "@/app/actions";
import { WishCamera } from "@/components/WishCamera";

export const dynamic = "force-dynamic";

export default async function WishPage() {
  const settings = await getSettingsAction();
  if (!settings) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#0d0f14] text-white/60">
        Settings unavailable
      </main>
    );
  }
  return <WishCamera settings={settings} />;
}
