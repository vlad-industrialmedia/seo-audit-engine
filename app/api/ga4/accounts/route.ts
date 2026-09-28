import { NextResponse } from "next/server";

export const maxDuration = 30;

// ─── Проксі: GA4 список акаунтів та властивостей ─────────────────────────────
// Повертає всі GA4 властивості доступні для даного access_token.
// Потрібен scope: https://www.googleapis.com/auth/analytics.readonly

export async function POST(req: Request) {
  try {
    const { accessToken } = (await req.json()) as { accessToken: string };

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken обов'язковий" },
        { status: 400 }
      );
    }

    // Отримуємо список акаунтів GA4 через Admin API
    const accountsRes = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accounts",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!accountsRes.ok) {
      const err = await accountsRes.text();
      console.error("[ga4/accounts] Admin API error:", accountsRes.status, err);
      return NextResponse.json(
        { error: `Google Analytics Admin API: ${accountsRes.status}`, detail: err.slice(0, 200) },
        { status: accountsRes.status }
      );
    }

    const accountsData = (await accountsRes.json()) as {
      accounts?: Array<{ name: string; displayName: string }>;
    };

    const accounts = accountsData.accounts ?? [];

    if (accounts.length === 0) {
      return NextResponse.json({ properties: [] });
    }

    // Для кожного акаунту отримуємо список GA4 властивостей
    const propertiesPromises = accounts.map(async (account) => {
      const propsRes = await fetch(
        `https://analyticsadmin.googleapis.com/v1beta/${account.name}/properties?filter=parent:${account.name}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!propsRes.ok) return [];

      const propsData = (await propsRes.json()) as {
        properties?: Array<{ name: string; displayName: string }>;
      };

      return (propsData.properties ?? []).map((p) => ({
        property: p.name,             // формат "properties/123456789"
        displayName: p.displayName,
        account: account.displayName,
      }));
    });

    const nestedProperties = await Promise.all(propertiesPromises);
    // Розгортаємо вкладені масиви в один плаский список
    const properties = ([] as Array<{ property: string; displayName: string; account: string }>).concat(
      ...nestedProperties
    );

    return NextResponse.json({ properties });
  } catch (err) {
    console.error("[ga4/accounts]", err);
    return NextResponse.json(
      { error: "Помилка отримання GA4 акаунтів", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
