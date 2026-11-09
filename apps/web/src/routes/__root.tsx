import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { StripProvider } from "../app/strip";
import { Screen } from "../app/Screen";
import { Banner } from "../ui/outpost";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: NotFound,
});

/** The Outpost frame: the status strip stays, screens change below it. */
function Root() {
  return (
    <div className="frame">
      <StripProvider>
        <Outlet />
      </StripProvider>
    </div>
  );
}

function NotFound() {
  return (
    <Screen module="home" title="Not found">
      <Banner tone="info" title="This page does not exist" action={<Link to="/" className="btn">Home</Link>} />
    </Screen>
  );
}
