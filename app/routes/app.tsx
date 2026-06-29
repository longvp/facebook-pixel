import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { requireAdmin, isE2E } from "../lib/auth.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "", e2e: isE2E() };
};

// Polaris link component that routes through Remix (client-side navigation).
function E2ELink({ children, url = "", external, ...rest }: any) {
  if (external) {
    return (
      <a href={url} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={url} {...rest}>
      {children}
    </Link>
  );
}

export default function App() {
  const { apiKey, e2e } = useLoaderData<typeof loader>();

  // E2E mode: render Polaris without App Bridge (which would redirect to the
  // Shopify admin when loaded outside the embedded iframe). Use a Remix-aware
  // link component so navigation is client-side (matches production behavior).
  if (e2e) {
    return (
      <PolarisAppProvider i18n={enTranslations} linkComponent={E2ELink}>
        <Outlet />
      </PolarisAppProvider>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/pixels">Pixels</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
