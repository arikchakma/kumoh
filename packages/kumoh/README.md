## kumoh

Opinionated framework for building Cloudflare Workers and Hono. File-based routing, auto-provisioned infrastructure, and end-to-end typed RPC, all from a single config file.

> Personal project, heavily inspired by [void.cloud](https://void.cloud) by voidzero.

### Prerequisites

As it's a opinionated framework, it requires a few tools to be installed.

- [Cloudflare account](https://cloudflare.com) - I mean come on, you're a developer, you should have one
- [Vite+](https://viteplus.dev) - The Unified Toolchain for the Web for managing formatting, linting, testing, and building
- [Node.js](https://nodejs.org)
- [pnpm](https://pnpm.io)

If you wanna learn more about these tools, please check out their documentation.

### Install

```sh
vp add -g kumoh
```

### Get Started

```sh
kumoh init vibey-app
cd vibey-app
vp install
```

### Features

Most frameworks make you configure infrastructure. Kumoh provisions it for you and gets out of the way.

- **File-based routing** - Drop a file in `app/routes/`, it becomes an endpoint. Export `GET`, `POST`, etc. or a default Hono sub-router.
- **Auto-provisioned infrastructure** - D1, KV, R2, Queues, and Email Routing are wired up automatically from your `kumoh.json`. No manual wrangler config.
- **End-to-end typed RPC** - Import your API handlers directly in the client. Full type safety across the network boundary, no codegen step.
- **Convention-based crons and queues** - Files in `app/crons/` and `app/queues/` are auto-registered as Cloudflare triggers. Just export a handler and a schedule.
- **Type-safe handlers** - `defineHandler`, `defineQueue`, `defineScheduled`, and `defineEmail` give you typed context and bindings without any manual setup.
- **Virtual modules** - `kumoh/db`, `kumoh/kv`, `kumoh/storage`, etc. are generated at build time based on your app. Import them anywhere, they just work.
- **Runtime wiring** - Bindings are injected at runtime. No env wrangling, no manual `c.env.DB`, just import and use.
- **CLI** - `kumoh deploy`, `kumoh db migrate`, `kumoh setup email`, and more. Everything you need to go from code to production.
- **Config** - A single `kumoh.json` is all you need. Deployment state is tracked there too, so the CLI always knows what's live.

If it's in Cloudflare's stack, kumoh probably handles it or will handle it soon.

### License

[MIT](/LICENSE) &copy; [Arik Chakma](https://twitter.com/imarikchakma)
