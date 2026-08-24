import { getSettings } from "@/server/settings/get-settings";
import { CheckoutWizard } from "@/components/customer/checkout-wizard";

// Settings (address/phone) can change from the admin at any time, and the
// availability gate this page leads into is time-sensitive — never let
// this get frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-hg-ink">Checkout</h1>
      <p className="mb-6 text-sm text-hg-brown/70">
        Collection from {settings.restaurantName}, {settings.addressLine}, {settings.city}
      </p>
      <CheckoutWizard restaurantPhone={settings.phone} />
    </div>
  );
}
