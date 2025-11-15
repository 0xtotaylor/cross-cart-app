"use server";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { GoogleGenAI } from "@google/genai";
import HenrySDK from "@henrylabs/sdk";

import type {
  ProductSummary,
  SlotId,
  WardrobeSlotImage,
} from "@/lib/types";

const henryClient = new HenrySDK({
  apiKey: process.env.HENRY_API_KEY!,
  environment: "sandbox",
});

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

const baseGeminiConfig = {
  temperature: 0,
  responseModalities: ["IMAGE", "TEXT"] as const,
  imageConfig: {
    imageSize: "1K",
  },
};

const geminiModel = "gemini-2.5-flash-image";

const SLOT_DISPLAY_LABELS: Record<SlotId, string> = {
  head: "Headwear",
  chest: "Top",
  waist: "Waist",
  legs: "Bottom",
  feet: "Footwear",
  ears: "Accessory",
  neck: "Accessory",
  bag: "Accessory",
  hand: "Accessory",
  ring: "Accessory",
};

const LAYERING_ORDER: SlotId[] = [
  "legs",
  "feet",
  "chest",
  "head",
  "bag",
  "hand",
  "neck",
  "ears",
  "ring",
  "waist",
];

const MAX_GARMENTS_PER_PASS = 2;

const ensureGeminiClient = () => {
  if (!geminiClient) {
    throw new Error("GEMINI_API_KEY must be configured to use this feature.");
  }
  return geminiClient;
};

const dataUrlToBuffer = (
  dataUrl: string
): { buffer: Buffer; mimeType: string } => {
  const matches = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!matches) {
    throw new Error("Invalid portrait data URL.");
  }
  const mimeType = matches[1] || "image/png";
  const base64 = matches[2];
  return {
    mimeType,
    buffer: Buffer.from(base64, "base64"),
  };
};

async function fetchImageBufferFromUrl(
  url: string,
  label: string
): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label} from ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function composeGarmentWithGemini({
  portraitBuffer,
  portraitMimeType,
  garments,
  prompt,
  modelVersion,
  seed,
}: {
  portraitBuffer: Buffer;
  portraitMimeType: string;
  garments: Array<{ buffer: Buffer; mimeType: string; label: string }>;
  prompt: string;
  modelVersion?: string;
  seed?: number | null;
}): Promise<Buffer> {
  const client = ensureGeminiClient();

  const contents = [
    {
      role: "user" as const,
      parts: [
        {
          text: prompt,
        },
        {
          inlineData: {
            mimeType: portraitMimeType,
            data: portraitBuffer.toString("base64"),
          },
        },
        ...garments.map((garment) => ({
          inlineData: {
            mimeType: garment.mimeType,
            data: garment.buffer.toString("base64"),
          },
        })),
      ],
    },
  ];

  const response = await client.models.generateContentStream({
    model: modelVersion ?? geminiModel,
    config: {
      ...baseGeminiConfig,
      responseModalities: ["IMAGE"],
      seed: seed ?? undefined,
    },
    contents,
  });

  for await (const chunk of response) {
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }
  }

  throw new Error("Gemini did not return an updated portrait.");
}

export const generateOutfitImage = async ({
  portrait,
  slots,
  modelVersion,
  seed,
}: {
  portrait: { buffer?: Buffer; mimeType?: string; dataUrl?: string };
  slots: Record<SlotId, WardrobeSlotImage | null>;
  modelVersion?: string;
  seed?: number | null;
}): Promise<{ image: string }> => {
  const slotAssets: Array<{ slot: SlotId; buffer: Buffer; mimeType: string }> =
    [];

  for (const slot of LAYERING_ORDER) {
    const asset = slots[slot];
    if (!asset) continue;

    if (asset.buffer) {
      slotAssets.push({
        slot,
        buffer: asset.buffer,
        mimeType: asset.mimeType ?? "image/png",
      });
      continue;
    }

    if (!asset.imageUrl) continue;
    const buffer = await fetchImageBufferFromUrl(asset.imageUrl, `slot ${slot}`);
    slotAssets.push({
      slot,
      buffer,
      mimeType: asset.mimeType ?? "image/png",
    });
  }

  if (!slotAssets.length) {
    throw new Error("At least one slot needs an image to render an outfit.");
  }

  let portraitBuffer = portrait.buffer;
  let portraitMimeType = portrait.mimeType;
  if (!portraitBuffer && portrait.dataUrl) {
    const parsed = dataUrlToBuffer(portrait.dataUrl);
    portraitBuffer = parsed.buffer;
    portraitMimeType = parsed.mimeType;
  }
  if (!portraitBuffer) {
    throw new Error("A processed portrait is required before generating.");
  }
  const resolvedPortraitMimeType = portraitMimeType || "image/png";

  let workingPortrait = portraitBuffer;

  for (let i = 0; i < slotAssets.length; i += MAX_GARMENTS_PER_PASS) {
    const passSlice = slotAssets.slice(i, i + MAX_GARMENTS_PER_PASS);
    const garmentSummary = passSlice
      .map(({ slot }, index) => {
        const label = SLOT_DISPLAY_LABELS[slot] ?? slot;
        return `${index + 1}. ${label} overlay (slot: ${slot})`;
      })
      .join("\n");

    const prompt = [
      "You are a virtual wardrobe stylist for apparel ecommerce.",
      "Keep the base portrait exactly the same person, including face, body, pose, lighting, framing, and background. Do not regenerate or replace the subject.",
      "Maintain the full-body framing from head through feet so footwear remains visible; stay inside the original 2:3 portrait bounds with approximately five percent headroom and footroom.",
      passSlice.length > 1
        ? "Apply all garments in this pass simultaneously without changing the person."
        : "Apply the garment listed below without changing the person.",
      "Blend the garments naturally on top of the existing portrait and maintain realistic proportions.",
      "Return only the updated portrait image (no standalone garment cutouts).",
      garmentSummary ? `Garments to apply:\n${garmentSummary}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    workingPortrait = await composeGarmentWithGemini({
      portraitBuffer: workingPortrait,
      portraitMimeType: resolvedPortraitMimeType,
      garments: passSlice.map(({ buffer, mimeType, slot }) => ({
        buffer,
        mimeType,
        label: SLOT_DISPLAY_LABELS[slot] ?? slot,
      })),
      prompt,
      modelVersion,
      seed,
    });
  }

  return {
    image: `data:${resolvedPortraitMimeType};base64,${workingPortrait.toString(
      "base64"
    )}`,
  };
};

export const removeBackgroundWithGoogle = async (
  buffer: Buffer,
  mimeType?: string | null
): Promise<{ buffer: Buffer; mimeType: string }> => {
  const client = ensureGeminiClient();

  const contents = [
    {
      role: "user" as const,
      parts: [
        {
          text: [
            "Isolate the individual from the supplied portrait without altering their identity, pose, or lighting.",
            "Extend the composition so the subject appears as a full-body portrait inside a 2:3 frame with roughly five percent headroom and footroom, keeping proportions natural.",
            "Scale and center the subject consistently, ensuring the head nears the top margin without clipping and feet stay inside the frame.",
            "Ensure both hands are clearly visible and unobstructed (not hidden in pockets, behind the body, or outside the frame).",
            "Render the background as pure white (#FFFFFF) with no gradients, shadows, or objects.",
          ].join(" "),
        },
        {
          inlineData: {
            mimeType: mimeType ?? "image/png",
            data: buffer.toString("base64"),
          },
        },
      ],
    },
  ];

  const response = await client.models.generateContentStream({
    model: geminiModel,
    config: baseGeminiConfig,
    contents,
  });

  let chunkCount = 0;
  for await (const chunk of response) {
    chunkCount++;
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const resultMimeType = part.inlineData.mimeType || "image/png";
        return {
          buffer: Buffer.from(part.inlineData.data, "base64"),
          mimeType: resultMimeType,
        };
      }
    }
  }

  throw new Error(
    `No image data found in Google GenAI response after processing ${chunkCount} chunks.`
  );
};

export const searchProducts = async (
  query: string,
  limit: number = 10
): Promise<ProductSummary[]> => {
  const search = await henryClient.products.search({
    query,
    limit,
  });

  return search.data as ProductSummary[];
};

export const getProductDetails = async (productId: string) => {
  const detail = await henryClient.products.retrieveDetails({
    productId,
  });

  return detail.data.productResults;
};

export const runAgent = async () => {
  try {
    console.log("🎯 Starting Locus Claude SDK application...\n");
    console.log("Configuring Locus MCP connection...");

    const mcpServers = {
      locus: {
        type: "http" as const,
        url: "https://mcp.paywithlocus.com/mcp",
        headers: {
          Authorization: `Bearer ${process.env.LOCUS_API_KEY}`,
        },
      },
      cross_cart: {
        type: "http" as const,
        url: "http://localhost:3000/api/mcp",
      },
    };

    const options = {
      mcpServers,
      allowedTools: [
        "mcp__locus__*",
        "mcp__cross_cart__*",
        "mcp__read_resource",
        "mcp__list_resources",
      ],
      apiKey: process.env.ANTHROPIC_API_KEY,
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (
          toolName.startsWith("mcp__locus__") ||
          toolName.startsWith("mcp__cross_cart__")
        ) {
          return {
            behavior: "allow" as const,
            updatedInput: input,
          };
        }
        return {
          behavior: "deny" as const,
          message: "Only Locus tools are allowed",
        };
      },
    };

    console.log("✓ MCP configured\n");
    console.log("Running sample query...\n");
    console.log("─".repeat(50));

    let mcpStatus = null;
    let finalResult = null;

    for await (const message of query({
      prompt: "What tools are available from Locus? Please list them.",
      options,
    })) {
      if (message.type === "system" && message.subtype === "init") {
        const mcpServersInfo = message.mcp_servers;
        mcpStatus = mcpServersInfo?.find(
          (s: { name: string }) => s.name === "locus"
        );
        if (mcpStatus?.status === "connected") {
          console.log(`✓ Connected to Locus MCP server\n`);
        } else {
          console.warn(`⚠️  MCP connection issue\n`);
        }
      } else if (message.type === "result" && message.subtype === "success") {
        finalResult = message.result;
      }
    }

    console.log("Response:", finalResult);
    console.log("─".repeat(50));
    console.log("\n✓ Query completed successfully!");
    console.log("\n🚀 Your Locus application is working!");
    console.log("\nNext steps:");
    console.log("  • Modify the prompt in index.ts to use Locus tools");
    console.log("  • Try asking Claude to use specific Locus tools");
    console.log("  • Explore MCP resources and capabilities\n");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error:", errorMessage);
    console.error("\nPlease check:");
    console.error("  • Your .env file contains valid credentials");
    console.error("  • Your network connection is active");
    console.error("  • Your Locus and Anthropic API keys are correct\n");
  }
};
