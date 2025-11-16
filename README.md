# Cross Cart

Cross Cart is a hackathon prototype for voice-native commerce. A conversational stylist queues live products from Henry Labs, assembles a complete wardrobe, generates a virtual try-on with Google’s Gemini models, and then pays merchants through the Locus payment network using an MCP-enabled agent run on Claude. The experience runs entirely inside a single Next.js app so it can be demoed quickly without extra orchestration.

## Experience Flow

1. **Voice intake** – The shopper lands on the intake screen and talks to the ElevenLabs real-time agent (“Alex”). The agent records every request (e.g., “retro surfboard” or “neon rash guard”) and calls the `setWardrobeSearch` client tool to populate the queue.
2. **Wardrobe builder** – Once multiple batches are queued the stylist calls `finalizeWardrobePrep`, which reveals the wardrobe. The user can also swap to it manually with the dock.
3. **Product discovery** – Swipeable cards (fed by the Henry API) let the shopper save items, which are then assigned to wardrobe slots either via the UI or via the `equipWardrobeSlot` voice tool.
4. **Virtual try-on** – A portrait upload is background stripped (`removeBackgroundWithGoogle`) and the equipped garments are layered over the user with `generateOutfitImage`, both powered by Gemini 2.5 Flash Image.
5. **Trustless checkout** – Equipped slots are packaged into a purchase order and passed to `runAgent`, which connects to the Locus MCP server and sends payments for each merchant via Claude’s Agent SDK. The Transactions dock shortcut links straight to the Locus dashboard for proof.

## Feature Highlights

- Voice-first orchestration powered by ElevenLabs’ `useConversation` hook and custom client tools that map directly to UI intents (`components/dock.tsx`).
- Live surf/outdoor catalog search through Henry Labs (`actions/searchProducts` + `app/api/products/search/route.ts`).
- Wardrobe + swipe UX inspired by gaming gear loadouts (`components/content.tsx`, `components/wardrobe.tsx`, `components/product-discovery.tsx`).
- Portrait cleanup and outfit transfer handled in two steps with Google’s Gemini image APIs (`actions/generateOutfitImage` and `actions/removeBackgroundWithGoogle`).
- Agentic checkout that only calls the Locus toolchain (`actions/runAgent`) so every purchase is auditable and replayable.
- Optional MCP transport endpoint (`app/api/[transport]/route.ts`) showing how additional local tools could be exposed to agents.

## Architecture at a Glance

### Frontend (Next.js 16, React 19, Tailwind 4)

- `components/content.tsx` is the screen state machine (intake → wardrobe → transactions → settings) and collects intake batches.
- `components/wardrobe.tsx` runs the multi-step wardrobe builder, slot assignment logic, portrait uploader, and “Generate/Purchase” CTAs that call server actions.
- `components/product-discovery.tsx` renders the stacked card carousel with swipe gestures.
- `components/dock.tsx` renders the macOS-style dock, wires up the ElevenLabs conversation, and exposes client tools (`setScreen`, `setWardrobeSearch`, `finalizeWardrobePrep`, `equipWardrobeSlot`).

### Server actions & APIs

- `actions/index.ts` bundles all privileged calls: Henry search, Gemini background removal + garment compositing, and the Claude→Locus purchasing agent run.
- `app/api/products/search/route.ts` sanitizes user prompts before forwarding to Henry and clamps page sizes for predictable demos.
- `app/api/virtual-try-on/portrait/route.ts` accepts uploads, returns a base64 data URL, and is used before every try-on render.
- `app/api/[transport]/route.ts` shows how to host extra MCP tools from the same deployment (a toy `roll_dice` tool today).

### Voice agent prompt pack

The ElevenLabs folder contains everything you need to recreate Alex:

- `elevenlabs/prompt.md` – persona/instructions injected into ElevenLabs during agent creation.
- `elevenlabs/*.json` – JSON definitions for your client tools. Import them in ElevenLabs so calls map 1:1 with the `clientTools` defined in `components/dock.tsx`.

### Purchasing agent

- The shopping cart is represented by `SelectedWardrobeItem` objects. When “Purchase” is triggered, `runAgent` builds a purchase order, spins up Claude’s Agent SDK with only the Locus MCP server enabled, and walks every merchant payment via `mcp__locus__send_to_address`.
- Merchant wallet addresses are hard-coded for the hackathon in `actions/index.ts` so demo payouts are deterministic.

## Local Setup

### Requirements

- Node.js 20+ (Next.js 16 requires Node 18.18 or newer; we build against v20.x).
- Yarn 1.22 (a lockfile is included).
- Access to the third-party APIs listed below.

### Installation

```bash
yarn install
cp .env.example .env.local   # or reuse the provided .env for demos
# populate the secrets, then run:
yarn dev
```

Visit `http://localhost:3000` and use the dock buttons or the voice orb to drive the experience.

### Environment Variables

| Variable                                  | Required                 | Purpose                                                                                                             |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                          | Yes (for virtual try-on) | Authenticates both `removeBackgroundWithGoogle` and `generateOutfitImage`. Needs access to Gemini 2.5 Flash Image.  |
| `HENRY_API_KEY`                           | Yes (for catalog)        | Powers `searchProducts`, which is the source of truth for wardrobe inventory.                                       |
| `LOCUS_API_KEY`                           | Yes (for payments)       | Injected as the Bearer token when connecting to the Locus MCP server inside `runAgent`.                             |
| `ANTHROPIC_API_KEY`                       | Yes (for agent runtime)  | Used by Claude’s Agent SDK to execute the Locus purchasing workflow.                                                |
| `NEXT_PUBLIC_ELEVEN_AGENT_ID`             | Yes (for voice UI)       | Placed on `window` so the client can boot the ElevenLabs WebRTC session.                                            |
| `LOCUS_CLIENT_ID` / `LOCUS_CLIENT_SECRET` | Optional                 | Only needed if you plan to request additional tokens from Locus outside of the MCP demo. Included for completeness. |

> Tip: `cp .env.example .env.local` gives you a scaffold for every secret. Populate the real values before starting the dev server.

## Running the Voice Stylist

1. Create a new **Conversational AI Agent** inside ElevenLabs.
2. Paste the contents of `elevenlabs/prompt.md` into the system prompt field.
3. Import each `*.json` file in `elevenlabs/` as a “Client Tool” so the function names and schemas match what the UI expects.
4. Copy the generated Agent ID into `NEXT_PUBLIC_ELEVEN_AGENT_ID`.
5. Start `yarn dev`, click the orb in the dock, and grant microphone permissions when prompted.

If you only want to test the screens without voice, skip ElevenLabs entirely and drive the flow with the buttons and wardrobe UI.

## Project Structure

```
actions/                  # Server actions for AI + agent workflows
app/api/*                 # Next.js App Router API routes (MCP transport, product search, portrait upload)
components/               # UI building blocks (Content, Wardrobe, Discovery, Dock)
components/ui/            # Design system primitives (dock, orb, draggable cards, etc.)
elevenlabs/               # Voice agent prompt and tool definitions
lib/types.ts              # Shared TypeScript types for wardrobe + product data
```

## Development Commands

| Command       | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `yarn dev`    | Start the Next.js dev server with live reload.                              |
| `yarn build`  | Compile the production bundle (useful for verifying the app still deploys). |
| `yarn start`  | Run the compiled build locally.                                             |
| `yarn lint`   | Execute ESLint across the project.                                          |
| `yarn format` | Format JS/TS files using Prettier + import sorting.                         |

## Troubleshooting

- **Voice agent not connecting?** Ensure `NEXT_PUBLIC_ELEVEN_AGENT_ID` is defined and you have granted microphone permission. The orb will reset to gray if the WebRTC session fails.
- **Wardrobe won’t open?** At least one `setWardrobeSearch` call must succeed (or manually trigger the search form) before the wardrobe step is allowed. The intake panel shows queued batches for clarity.
- **Portrait upload failing?** Files must be ≤5 MB and in JPG/PNG/HEIC/WEBP formats. Validation happens client-side before hitting `/api/virtual-try-on/portrait`.
- **Payment agent crashes immediately?** Confirm `ANTHROPIC_API_KEY` and `LOCUS_API_KEY` are present. The run logs print directly to the server console so you can copy/paste results into your demo notes.
