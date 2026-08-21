import { getPublicMenu } from "@/server/menu/public-menu";
import { MenuBrowser } from "@/components/customer/menu-browser";

export default async function MenuPage() {
  const categories = await getPublicMenu();

  if (categories.length === 0) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-hg-brown/70">
          The menu isn&apos;t available online right now — please check back shortly.
        </p>
      </main>
    );
  }

  return <MenuBrowser categories={categories} />;
}
