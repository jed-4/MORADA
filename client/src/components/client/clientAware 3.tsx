import type { ComponentType } from "react";
import { useClientPortal } from "@/hooks/use-client-portal";

/**
 * Pick the component a route renders by who is looking.
 *
 * The builder's detail pages (a variation, a progress claim, an allowance's
 * cost ledger) are full-page editors routed outside the project shell. A
 * client on those same addresses should get the portal's read-only version,
 * rendered inside the project shell so they keep the header and section tabs.
 *
 * Used at the route table rather than inside each page: a page that starts
 * with the builder's queries and mutations has already asked the server for
 * things a client may not have, and gets a screenful of 403s before any
 * isClient branch runs.
 */
export function clientAware(Builder: ComponentType<any>, Client: ComponentType<any>): ComponentType<any> {
  return function ClientAwareRoute(props: any) {
    const { isClient } = useClientPortal();
    return isClient ? <Client {...props} /> : <Builder {...props} />;
  };
}
