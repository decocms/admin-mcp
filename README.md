# deco Admin MCP 

An MCP server for managing [deco.cx](https://deco.cx) sites — with interactive UIs built as MCP Apps. Manage assets, environments, and AI sandbox tasks directly from your MCP host (Claude Desktop, Cursor, etc.).

## Tools

### Assets
| Tool | Description |
|------|-------------|
| `fetch_assets` | Browse and search your site's media library (images, videos, documents, fonts) with pagination |
| `upload_asset` | Upload a new file to the site's asset library |
| `delete_asset` | Remove an asset from the library by its path |

### Environments
| Tool | Description |
|------|-------------|
| `list_environments` | List all environments with their URL, platform, and git metadata |
| `get_environment` | Get details for a specific environment by name |
| `create_environment` | Provision a new environment from a branch (deco/content/tunnel platforms) |
| `preview_environment` | Get a cache-busted live preview URL for any path in an environment |

### Sandbox
| Tool | Description |
|------|-------------|
| `create_sandbox_task` | Spin up an autonomous AI agent (Claude Code) task from a prompt or GitHub issue |
| `list_sandbox_tasks` | List all agent tasks in a sandbox environment with live terminal connection info |
| `kill_sandbox_task` | Terminate a running agent task |

## Configuration

The server requires two values, set via MCP host configuration:

| Key | Description |
|-----|-------------|
| `DECO_ADMIN_API_KEY` | API key for authenticating with the deco.cx admin API |
| `SITE_NAME` | The deco.cx site to manage (e.g. `my-store`) |

## Setup

### Prerequisites

- [Bun](https://bun.sh) v1.x

### Install & run

```bash
git clone https://github.com/decocms/admin-mcp.git
cd admin-mcp
bun install
bun run dev
```

The MCP endpoint will be available at `http://localhost:3001/api/mcp`.

### Connect to your MCP host

Add the following to your MCP client config (e.g. `claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "deco-admin": {
      "type": "sse",
      "url": "http://localhost:3001/api/mcp",
      "config": {
        "DECO_ADMIN_API_KEY": "your-api-key",
        "SITE_NAME": "your-site-name"
      }
    }
  }
}
```

A `.mcp.json` is included at the repo root for local development with Cursor.

## Development

```bash
bun run dev          # API server + web build (watch mode) in parallel
bun run dev:api      # API server only (port 3001, hot reload)
bun run dev:web      # Web build only (watch mode)
bun run build        # Production build (web + server)
bun run check        # TypeScript type checking
bun run fmt          # Auto-format with Biome
bun run lint         # Auto-fix lint issues with Biome
bun test             # Run tests
```

## Project Structure

```
├── api/
│   ├── main.ts                  # Server entry point
│   ├── tools/
│   │   ├── index.ts             # Tool registry
│   │   ├── assets.ts            # fetch_assets tool
│   │   ├── upload-asset.ts      # upload_asset tool
│   │   ├── delete-asset.ts      # delete_asset tool
│   │   ├── environments.ts      # Environment tools (list/get/create/preview)
│   │   └── sandbox.ts           # Sandbox task tools (create/list/kill)
│   ├── resources/               # MCP App HTML resources (one per tool group)
│   └── types/env.ts             # StateSchema (DECO_ADMIN_API_KEY, SITE_NAME)
├── web/
│   ├── tools/
│   │   ├── assets/              # Asset gallery UI
│   │   ├── upload-asset/        # Upload UI
│   │   ├── delete-asset/        # Delete confirmation UI
│   │   ├── environments/        # Environment management UI
│   │   └── sandbox/             # Sandbox terminal UI
│   ├── router.tsx               # Runtime tool → page routing
│   └── components/ui/           # shadcn/ui components
├── app.json                     # deco mesh config
└── .mcp.json                    # Local MCP server config
```

## How It Works

Each tool carries a `_meta.ui.resourceUri` that points to an MCP App resource. When the MCP host calls a tool, it loads the corresponding HTML bundle and renders an interactive UI — a media gallery for assets, a live terminal for sandbox tasks, an environment card for deployments, and so on.

The UI connects back to the MCP host via `@modelcontextprotocol/ext-apps`, receives the tool's input and output, and renders the appropriate view.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **MCP Server**: [@decocms/runtime](https://github.com/decocms/runtime)
- **UI**: React 19 + [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **MCP Apps SDK**: [@modelcontextprotocol/ext-apps](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
- **Build**: [Vite](https://vitejs.dev) + [vite-plugin-singlefile](https://github.com/nickreese/vite-plugin-singlefile)
- **Linting/Formatting**: [Biome](https://biomejs.dev)

## CI

GitHub Actions runs on every push and pull request:

- `bun run ci:check` — Biome lint + format check
- `bun run check` — TypeScript type checking
- `bun test` — Unit tests
- `bun run build` — Production build
