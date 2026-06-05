import {
  AgentSessionManifestSchema,
  type AgentSessionManifest
} from "@openstrat/domain";
import type { EventLogRepository } from "@openstrat/persistence";
import type { AgentToolGatewayToolName } from "@openstrat/workers";

const DISABLED_PI_BUILTIN_TOOLS = ["read", "bash", "edit", "write"] as const;

export interface PiRuntimeAdapterDependencies {
  events: EventLogRepository;
  now?: () => string;
  sessionFactory?: PiAgentSessionFactory;
}

export interface StartPiAgentSessionInput {
  manifest: unknown;
  toolNames: readonly AgentToolGatewayToolName[];
}

export interface PiAgentRuntimeSession {
  session_id: string;
  runtime_session_id: string;
  enabled_tools: readonly AgentToolGatewayToolName[];
  disabled_builtin_tools: readonly (typeof DISABLED_PI_BUILTIN_TOOLS)[number][];
  transcript_ref: string;
}

export interface PromptPiAgentSessionInput {
  session_id: string;
  prompt: string;
}

export interface PiAgentRuntimeAdapter {
  startSession(input: StartPiAgentSessionInput): Promise<PiAgentRuntimeSession>;
  prompt(input: PromptPiAgentSessionInput): Promise<void>;
  dispose(sessionId: string): Promise<void>;
}

export interface PiAgentSessionFactoryInput {
  manifest: AgentSessionManifest;
  toolNames: readonly AgentToolGatewayToolName[];
}

export interface PiAgentSessionLike {
  readonly sessionId: string;
  subscribe(listener: (event: PiAgentSessionEvent) => void): () => void;
  prompt(prompt: string): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface PiAgentSessionFactory {
  create(input: PiAgentSessionFactoryInput): Promise<PiAgentSessionLike>;
}

export type PiAgentSessionEvent =
  | {
      type: "tool_execution_start";
      toolCallId?: string;
      toolName?: string;
    }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      toolName?: string;
      isError?: boolean;
    }
  | {
      type: "agent_end";
      messages?: unknown[];
    }
  | {
      type: "message_update";
      delta?: string;
    };

interface ActivePiSession {
  manifest: AgentSessionManifest;
  runtime: PiAgentRuntimeSession;
  session: PiAgentSessionLike;
  unsubscribe: () => void;
}

export function createPiAgentRuntimeAdapter(
  dependencies: PiRuntimeAdapterDependencies
): PiAgentRuntimeAdapter {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const sessionFactory =
    dependencies.sessionFactory ?? createDefaultPiAgentSessionFactory();
  const activeSessions = new Map<string, ActivePiSession>();

  return {
    async startSession(input) {
      const manifest = AgentSessionManifestSchema.parse(input.manifest);
      const session = await sessionFactory.create({
        manifest,
        toolNames: input.toolNames
      });
      const runtime: PiAgentRuntimeSession = {
        session_id: manifest.id,
        runtime_session_id: session.sessionId,
        enabled_tools: [...input.toolNames],
        disabled_builtin_tools: [...DISABLED_PI_BUILTIN_TOOLS],
        transcript_ref: manifest.transcript_ref.uri
      };
      const unsubscribe = session.subscribe((event) => {
        projectPiEvent(dependencies.events, now(), manifest, event);
      });
      activeSessions.set(manifest.id, { manifest, runtime, session, unsubscribe });

      dependencies.events.append({
        stream_id: manifest.event_stream_id,
        type: "agent.runtime.session_started",
        occurred_at: now(),
        payload: {
          runtime: manifest.runtime.kind,
          runtime_session_id: session.sessionId,
          enabled_tools: runtime.enabled_tools,
          disabled_builtin_tools: runtime.disabled_builtin_tools,
          transcript_ref: manifest.transcript_ref.uri
        }
      });

      return runtime;
    },

    async prompt(input) {
      const active = activeSessions.get(input.session_id);
      if (!active) {
        throw new Error(`Pi agent session not found: ${input.session_id}`);
      }
      dependencies.events.append({
        stream_id: active.manifest.event_stream_id,
        type: "agent.runtime.turn_started",
        occurred_at: now(),
        payload: {
          prompt_ref: `${active.manifest.event_stream_id}/turn/input`,
          runtime_session_id: active.session.sessionId
        }
      });
      await active.session.prompt(input.prompt);
    },

    async dispose(sessionId) {
      const active = activeSessions.get(sessionId);
      if (!active) {
        return;
      }
      active.unsubscribe();
      await active.session.dispose();
      activeSessions.delete(sessionId);
    }
  };
}

export function createFakePiAgentSessionFactory(
  options: {
    events?: PiAgentSessionEvent[];
  } = {}
): PiAgentSessionFactory {
  return {
    async create(input) {
      return new FakePiAgentSession(
        input.manifest.id,
        options.events ?? [{ type: "agent_end", messages: [] }]
      );
    }
  };
}

export function createDefaultPiAgentSessionFactory(): PiAgentSessionFactory {
  return {
    async create(input) {
      const pi = await import("@earendil-works/pi-coding-agent");
      const authStorage = pi.AuthStorage.inMemory();
      const modelRegistry = pi.ModelRegistry.inMemory(authStorage);
      const { session } = await pi.createAgentSession({
        agentDir: input.manifest.transcript_ref.uri,
        authStorage,
        cwd: process.cwd(),
        modelRegistry,
        noTools: "builtin",
        sessionManager: pi.SessionManager.inMemory()
      });
      return {
        sessionId: session.sessionId,
        subscribe: (listener) => session.subscribe(listener as never),
        prompt: (prompt) => session.prompt(prompt),
        dispose: () => session.dispose()
      };
    }
  };
}

function projectPiEvent(
  events: EventLogRepository,
  occurredAt: string,
  manifest: AgentSessionManifest,
  event: PiAgentSessionEvent
): void {
  if (event.type === "tool_execution_start") {
    events.append({
      stream_id: manifest.event_stream_id,
      type: "agent.runtime.tool_call_requested",
      occurred_at: occurredAt,
      payload: {
        tool_call_id: event.toolCallId,
        tool_name: event.toolName
      }
    });
    return;
  }

  if (event.type === "tool_execution_end") {
    events.append({
      stream_id: manifest.event_stream_id,
      type: "agent.runtime.tool_call_completed",
      occurred_at: occurredAt,
      payload: {
        tool_call_id: event.toolCallId,
        tool_name: event.toolName,
        is_error: event.isError === true
      }
    });
    return;
  }

  if (event.type === "message_update") {
    events.append({
      stream_id: manifest.event_stream_id,
      type: "agent.runtime.message_delta",
      occurred_at: occurredAt,
      payload: {
        delta: event.delta ?? ""
      }
    });
    return;
  }

  events.append({
    stream_id: manifest.event_stream_id,
    type: "agent.runtime.turn_completed",
    occurred_at: occurredAt,
    payload: {
      message_count: event.messages?.length ?? 0
    }
  });
}

class FakePiAgentSession implements PiAgentSessionLike {
  readonly sessionId: string;
  private readonly listeners = new Set<(event: PiAgentSessionEvent) => void>();

  constructor(
    sessionId: string,
    private readonly events: PiAgentSessionEvent[]
  ) {
    this.sessionId = `fake-pi:${sessionId}`;
  }

  subscribe(listener: (event: PiAgentSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(_prompt: string): Promise<void> {
    for (const event of this.events) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
