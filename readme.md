<div align="center">
  <img src="https://kumoh.dev/favicon.svg" alt="kumoh" width="48" height="48">
  <h2>kumoh</h2>
  <p align="center">
    <a href="https://github.com/arikchakma/kumoh/blob/main/license">
      <img src="https://img.shields.io/badge/License-MIT-222222.svg" />
    </a>
    <a href="https://kumoh.dev">
        <img src="https://img.shields.io/badge/%E2%9C%A8-Try%20Demo-0a0a0a.svg?style=flat&colorA=222222" alt="Try Demo" />
    </a>
  </p>
</div>

<p align="center">Opinionated framework for building APIs on Cloudflare Workers with a focus on simplicity and ease of use.</p>

kumoh is a batteries-included framework for building APIs on Cloudflare Workers. It handles the infrastructure so you can focus on the code file-based routing, auto-provisioned D1, KV, R2, Queues, and Email Routing & Sending, end-to-end typed RPC, and takes you to production in minutes.

> Heavily inspired by [void.cloud](https://void.cloud) by voidzero.

### What's in This Repo

- [`packages/kumoh`](./packages/kumoh) - The framework. See the readme there for full docs, installation, and usage.
- [`examples/api`](./examples/api) - Example API built with kumoh (D1, KV, R2, queues, email).
- [`examples/web`](./examples/web) - Example frontend (React Router SPA) that consumes the API via typed RPC.

### Acknowledgements

kumoh is built on top of some excellent tools and wouldn't be possible without them:

- [Void Cloud](https://void.cloud) by voidzero - The inspiration for kumoh.
- [Cloudflare Workers](https://workers.cloudflare.com) — The runtime. D1, KV, R2, Queues, and Email Routing are all first-class Cloudflare primitives.
- [Hono](https://hono.dev) — The HTTP framework powering the routing layer. Fast, lightweight, and built for the edge.
- [Vite+](https://viteplus.dev) — The unified toolchain used for building, type-checking, and formatting across the monorepo.
- [Wrangler](https://developers.cloudflare.com/workers/wrangler) — The CLI under the hood for deploying Workers and managing Cloudflare resources.
- [Drizzle ORM](https://orm.drizzle.team) — Type-safe SQL for D1. Powers the `kumoh/db` virtual module and migration tooling.

### Contributing

Feel free to submit pull requests, create issues, or spread the word.

### License

[MIT](/license) &copy; [Arik Chakma](https://x.com/imarikchakma)
