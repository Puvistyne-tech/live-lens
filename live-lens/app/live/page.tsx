import { getApprovedMediaAction, getSettingsAction } from "@/app/actions";
import { LiveWall } from "@/components/LiveWall";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [items, settings] = await Promise.all([getApprovedMediaAction(60), getSettingsAction()]);
  return <LiveWall initialItems={items} settings={settings} />;
}
