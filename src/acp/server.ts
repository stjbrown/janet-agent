import { Readable, Writable } from "node:stream";
import {
  agent,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type AgentApp,
} from "@agentclientprotocol/sdk";
import { packageVersion } from "../version.js";
import { acpPromptText, JanetAcpRegistry, type JanetAcpRegistryOptions } from "./session.js";

export interface JanetAcpAgent {
  app: AgentApp;
  registry: JanetAcpRegistry;
}

export function createJanetAcpAgent(
  options: JanetAcpRegistryOptions = {},
): JanetAcpAgent {
  const registry = new JanetAcpRegistry(options);
  const app = agent({ name: "janet" })
    .onRequest(methods.agent.initialize, ({ params }) => {
      registry.clientCapabilities = params.clientCapabilities;
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: false,
        },
        agentInfo: {
          name: "janet",
          title: "Janet",
          version: packageVersion(),
        },
        authMethods: [],
      };
    })
    .onRequest(methods.agent.session.new, async ({ params }) => {
      const session = await registry.create({
        cwd: params.cwd,
        mcpServers: params.mcpServers,
        ...(params.additionalDirectories
          ? { additionalDirectories: params.additionalDirectories }
          : {}),
      });
      return { sessionId: session.id };
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client, signal }) => {
      const session = registry.get(params.sessionId);
      return session.prompt(acpPromptText(params.prompt), {
        client,
        signal,
        formElicitation: registry.supportsFormElicitation(),
      });
    })
    .onNotification(methods.agent.session.cancel, ({ params }) => {
      registry.cancel(params.sessionId);
    });

  return { app, registry };
}

export interface RunAcpOptions extends JanetAcpRegistryOptions {
  input?: Readable;
  output?: Writable;
}

export async function runAcpServer(options: RunAcpOptions = {}): Promise<number> {
  const { input = process.stdin, output = process.stdout, ...registryOptions } = options;
  const { app, registry } = createJanetAcpAgent(registryOptions);
  const writable = Writable.toWeb(output) as WritableStream<Uint8Array>;
  const readable = Readable.toWeb(input) as ReadableStream<Uint8Array>;
  const connection = app.connect(ndJsonStream(writable, readable));
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void registry.disposeAll().finally(() => connection.close());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await connection.closed;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await registry.disposeAll();
  }
  return 0;
}
