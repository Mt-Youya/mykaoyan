import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import { LegalLinks } from "./(legal)/-legal/documents"

import "../globals.css"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "我的考研" },
    ],
  }),
  component: () => (
    <html lang="zh-CN" className="overflow-x-clip">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <LegalLinks />
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
        <Scripts />
      </body>
    </html>
  ),
})
