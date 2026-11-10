import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Boot } from "../app/Boot";
import { StripProvider } from "../app/strip";
import { Screen } from "../app/Screen";
import { Banner, Illustration } from "../ui/outpost";

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
      <Boot />
    </div>
  );
}

function NotFound() {
  return (
    <Screen module="home" title="Not found">
      <Illustration name="lost" className="gate-art" />
      <Banner tone="info" title="This page does not exist" action={<Link to="/" className="btn">Home</Link>} />
    </Screen>
  );
}
