import {
  AgentSessionManifestSchema,
  type AgentSessionManifest
} from "@openstrat/domain";
import type { EventLogRepository } from "@openstrat/persistence";
import type { AgentToolGateway } from "@openstrat/workers";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DISABLED_CODEX_NATIVE_TOOLS = [
  "shell",
  "apply_patch",
  "read",
  "write",
  "edit"
] as const;

const OPENSTRAT_RUNTIME_EVENT_CUSTOM_TYPE = "openstrat.runtime_event";

export interface StartCodexAppServerSessionInput {
  manifest: unknown;
  toolNames: readonly string[];
}

export interface ResumeCodexAppServerSessionInput extends StartCodexAppServerSessionInput {
  codex_thread_id: string;
  transcript_ref: string;
}

export interface ForkCodexAppServerSessionInput extends StartCodexAppServerSessionInput {
  parent_session_id: string;
  parent_codex_thread_id: string;
  parent_transcript_ref: string;
}

export interface PromptCodexAppServerSessionInput {
  session_id: string;
  prompt: string;
}

export interface CodexAppServerRuntimeSession {
  session_id: string;
  runtime_session_id: string;
  codex_thread_id: string;
  transcript_ref: string;
  enabled_tools: string[];
  disabled_native_tools: string[];
  parent_session_id?: string;
  parent_codex_thread_id?: string;
  parent_transcript_ref?: string;
  resumed_from_codex_thread_id?: string;
}

export interface CodexAppServerRuntimeAdapter {
  startSession(
    input: StartCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession>;
  resumeSession(
    input: ResumeCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession>;
  forkSession(
    input: ForkCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession>;
  prompt(input: PromptCodexAppServerSessionInput): Promise<void>;
  dispose(sessionId: string): Promise<void>;
}

export interface CodexAppServerRuntimeAdapterDependencies {
  bindingStore?: CodexAppServerBindingStore;
  events?: EventLogRepository;
  now?: () => string;
  toolGateway?: AgentToolGateway;
  transcriptStore?: CodexAppServerTranscriptStore;
}

export interface FakeCodexAppServerRuntimeAdapterOptions {
  bindingStore?: CodexAppServerBindingStore;
  events?: EventLogRepository;
  now?: () => string;
  responseText?: string;
  runtimeEvents?: readonly CodexAppServerRuntimeEvent[];
  toolGateway?: AgentToolGateway;
  transcriptStore?: CodexAppServerTranscriptStore;
}

export type CodexAppServerRuntimeEvent =
  | {
      type: "tool_call_requested";
      tool_call_id?: string;
      tool_name: string;
      arguments?: Record<string, unknown>;
    }
  | {
      type: "message_delta";
      delta?: string;
    }
  | {
      type: "turn_completed";
      assistant_text?: string;
      message_count?: number;
    };

export interface CodexAppServerThreadBinding {
  openstrat_session_id: string;
  runtime_session_id: string;
  codex_thread_id: string;
  transcript_ref: string;
  created_at: string;
  updated_at: string;
  enabled_tools: string[];
  disabled_native_tools: string[];
  parent_session_id?: string;
  parent_codex_thread_id?: string;
  parent_transcript_ref?: string;
  resumed_from_codex_thread_id?: string;
}

export interface CodexAppServerBindingStore {
  read(sessionId: string): CodexAppServerThreadBinding | undefined;
  write(binding: CodexAppServerThreadBinding): void;
}

export class FileCodexAppServerBindingStore implements CodexAppServerBindingStore {
  private readonly bindingsDir: string;

  constructor(rootDir: string) {
    this.bindingsDir = resolve(rootDir, "agent-runtime", "codex-app-server-bindings");
    mkdirSync(this.bindingsDir, { recursive: true });
  }

  read(sessionId: string): CodexAppServerThreadBinding | undefined {
    const path = this.resolveBindingPath(sessionId);
    if (!existsSync(path)) {
      return undefined;
    }
    return JSON.parse(readFileSync(path, "utf8")) as CodexAppServerThreadBinding;
  }

  write(binding: CodexAppServerThreadBinding): void {
    writeFileSync(
      this.resolveBindingPath(binding.openstrat_session_id),
      `${JSON.stringify(binding, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600
      }
    );
  }

  private resolveBindingPath(sessionId: string): string {
    return join(this.bindingsDir, `${safeRuntimeId(sessionId)}.json`);
  }
}

export interface CodexAppServerTranscriptCreateInput {
  manifest: AgentSessionManifest;
  parent_transcript_ref?: string;
}

export interface CodexAppServerTranscriptStore {
  create(input: CodexAppServerTranscriptCreateInput): string;
  appendRuntimeEvent(
    transcriptRef: string,
    event: { type: string; data: unknown }
  ): void;
  read(transcriptRef: string): unknown[];
}

export class FileCodexAppServerTranscriptStore implements CodexAppServerTranscriptStore {
  private readonly sessionsDir: string;

  constructor(rootDir: string) {
    this.sessionsDir = resolve(rootDir, "agent-runtime", "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  create(input: CodexAppServerTranscriptCreateInput): string {
    const transcriptRef = this.resolveSessionPath(input.manifest.id);
    const header = {
      type: "session",
      version: 3,
      id: input.manifest.id,
      timestamp: input.manifest.created_at,
      cwd: process.cwd(),
      runtime: "codex_app_server",
      ...(input.parent_transcript_ref
        ? { parentSession: input.parent_transcript_ref }
        : {})
    };
    writeFileSync(transcriptRef, `${JSON.stringify(header)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    return transcriptRef;
  }

  appendRuntimeEvent(
    transcriptRef: string,
    event: { type: string; data: unknown }
  ): void {
    mkdirSync(dirname(transcriptRef), { recursive: true });
    const entry = {
      type: "custom",
      id: entryId(),
      parentId: null,
      timestamp: new Date().toISOString(),
      customType: OPENSTRAT_RUNTIME_EVENT_CUSTOM_TYPE,
      data: event
    };
    appendFileSync(transcriptRef, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8"
    });
  }

  read(transcriptRef: string): unknown[] {
    return readFileSync(transcriptRef, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }

  private resolveSessionPath(sessionId: string): string {
    return join(this.sessionsDir, `${safeRuntimeId(sessionId)}.jsonl`);
  }
}

interface FakeActiveCodexSession {
  manifest: AgentSessionManifest;
  runtime: CodexAppServerRuntimeSession;
  prompts: string[];
}

export class FakeCodexAppServerRuntimeAdapter implements CodexAppServerRuntimeAdapter {
  private readonly bindingStore: CodexAppServerBindingStore | undefined;
  private readonly events: EventLogRepository | undefined;
  private readonly now: () => string;
  private readonly runtimeEvents: readonly CodexAppServerRuntimeEvent[];
  private readonly sessions = new Map<string, FakeActiveCodexSession>();
  private readonly promptHistory = new Map<string, string[]>();
  private readonly toolGateway: AgentToolGateway | undefined;
  private readonly transcriptStore: CodexAppServerTranscriptStore | undefined;

  constructor(options: FakeCodexAppServerRuntimeAdapterOptions = {}) {
    this.bindingStore = options.bindingStore;
    this.events = options.events;
    this.now = options.now ?? (() => new Date().toISOString());
    this.runtimeEvents =
      options.runtimeEvents ??
      defaultRuntimeEvents(options.responseText ?? "Fake Codex app-server response.");
    this.toolGateway = options.toolGateway;
    this.transcriptStore = options.transcriptStore;
  }

  async startSession(
    input: StartCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {
      event_type: "agent.runtime.session_started"
    });
  }

  async resumeSession(
    input: ResumeCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {
      codex_thread_id: input.codex_thread_id,
      event_type: "agent.runtime.session_resumed",
      transcript_ref: input.transcript_ref,
      resumed_from_codex_thread_id: input.codex_thread_id
    });
  }

  async forkSession(
    input: ForkCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {
      event_type: "agent.runtime.session_forked",
      parent_session_id: input.parent_session_id,
      parent_codex_thread_id: input.parent_codex_thread_id,
      parent_transcript_ref: input.parent_transcript_ref
    });
  }

  async prompt(input: PromptCodexAppServerSessionInput): Promise<void> {
    const session = this.sessions.get(input.session_id);
    if (!session) {
      throw new Error(`Codex app-server session not found: ${input.session_id}`);
    }

    session.prompts.push(input.prompt);
    this.promptHistory.set(input.session_id, [...session.prompts]);
    const occurredAt = this.now();
    this.appendRuntimeEvent({
      manifest: session.manifest,
      occurred_at: occurredAt,
      payload: {
        codex_thread_id: session.runtime.codex_thread_id,
        prompt_ref: `${session.manifest.event_stream_id}/turn/input`,
        runtime_session_id: session.runtime.runtime_session_id
      },
      runtime: session.runtime,
      type: "agent.runtime.turn_started"
    });
    for (const runtimeEvent of this.runtimeEvents) {
      await this.projectRuntimeEvent(session, occurredAt, runtimeEvent);
    }
  }

  async dispose(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  promptsFor(sessionId: string): string[] {
    return this.promptHistory.get(sessionId) ?? [];
  }

  private createSession(
    input: StartCodexAppServerSessionInput,
    overrides: Partial<CodexAppServerRuntimeSession> & {
      event_type:
        | "agent.runtime.session_started"
        | "agent.runtime.session_resumed"
        | "agent.runtime.session_forked";
    }
  ): CodexAppServerRuntimeSession {
    const manifest = AgentSessionManifestSchema.parse(input.manifest);
    if (manifest.runtime.kind !== "codex_app_server") {
      throw new Error("Codex app-server adapter requires codex_app_server runtime");
    }
    const occurredAt = this.now();

    const codexThreadId =
      overrides.codex_thread_id ?? `codex_thread_${safeRuntimeId(manifest.id)}`;
    const transcriptRef =
      overrides.transcript_ref ??
      this.transcriptStore?.create({
        manifest,
        ...(overrides.parent_transcript_ref
          ? { parent_transcript_ref: overrides.parent_transcript_ref }
          : {})
      }) ??
      manifest.transcript_ref.uri;
    const runtime: CodexAppServerRuntimeSession = {
      session_id: manifest.id,
      runtime_session_id: `codex_app_server_${safeRuntimeId(manifest.id)}`,
      codex_thread_id: codexThreadId,
      transcript_ref: transcriptRef,
      enabled_tools: [...input.toolNames],
      disabled_native_tools: [...DISABLED_CODEX_NATIVE_TOOLS],
      ...definedRuntimeOverrides(withoutEventType(overrides))
    };

    this.sessions.set(manifest.id, {
      manifest,
      runtime,
      prompts: []
    });
    this.persistBinding(runtime, occurredAt);
    this.appendRuntimeEvent({
      manifest,
      occurred_at: occurredAt,
      payload: {
        runtime: manifest.runtime.kind,
        runtime_session_id: runtime.runtime_session_id,
        codex_thread_id: runtime.codex_thread_id,
        enabled_tools: runtime.enabled_tools,
        disabled_native_tools: runtime.disabled_native_tools,
        transcript_ref: runtime.transcript_ref,
        ...(runtime.parent_session_id
          ? { parent_session_id: runtime.parent_session_id }
          : {}),
        ...(runtime.parent_codex_thread_id
          ? { parent_codex_thread_id: runtime.parent_codex_thread_id }
          : {}),
        ...(runtime.parent_transcript_ref
          ? { parent_transcript_ref: runtime.parent_transcript_ref }
          : {}),
        ...(runtime.resumed_from_codex_thread_id
          ? { resumed_from_codex_thread_id: runtime.resumed_from_codex_thread_id }
          : {})
      },
      runtime,
      type: overrides.event_type
    });
    return runtime;
  }

  private persistBinding(
    runtime: CodexAppServerRuntimeSession,
    occurredAt: string
  ): void {
    const existing = this.bindingStore?.read(runtime.session_id);
    this.bindingStore?.write({
      openstrat_session_id: runtime.session_id,
      runtime_session_id: runtime.runtime_session_id,
      codex_thread_id: runtime.codex_thread_id,
      transcript_ref: runtime.transcript_ref,
      created_at: existing?.created_at ?? occurredAt,
      updated_at: occurredAt,
      enabled_tools: runtime.enabled_tools,
      disabled_native_tools: runtime.disabled_native_tools,
      ...(runtime.parent_session_id
        ? { parent_session_id: runtime.parent_session_id }
        : {}),
      ...(runtime.parent_codex_thread_id
        ? { parent_codex_thread_id: runtime.parent_codex_thread_id }
        : {}),
      ...(runtime.parent_transcript_ref
        ? { parent_transcript_ref: runtime.parent_transcript_ref }
        : {}),
      ...(runtime.resumed_from_codex_thread_id
        ? { resumed_from_codex_thread_id: runtime.resumed_from_codex_thread_id }
        : {})
    });
  }

  private appendRuntimeEvent(event: {
    manifest: AgentSessionManifest;
    occurred_at: string;
    payload: Record<string, unknown>;
    runtime: CodexAppServerRuntimeSession;
    type: string;
  }): void {
    this.events?.append({
      stream_id: event.manifest.event_stream_id,
      type: event.type,
      occurred_at: event.occurred_at,
      payload: event.payload,
      metadata: {
        transcript_ref: event.runtime.transcript_ref
      }
    });
    this.transcriptStore?.appendRuntimeEvent(event.runtime.transcript_ref, {
      type: event.type,
      data: event.payload
    });
  }

  private async projectRuntimeEvent(
    session: FakeActiveCodexSession,
    occurredAt: string,
    runtimeEvent: CodexAppServerRuntimeEvent
  ): Promise<void> {
    if (runtimeEvent.type === "message_delta") {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          delta: runtimeEvent.delta ?? ""
        },
        runtime: session.runtime,
        type: "agent.runtime.message_delta"
      });
      return;
    }

    if (runtimeEvent.type === "turn_completed") {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          ...(runtimeEvent.assistant_text
            ? { assistant_text: runtimeEvent.assistant_text }
            : {}),
          message_count: runtimeEvent.message_count ?? 0
        },
        runtime: session.runtime,
        type: "agent.runtime.turn_completed"
      });
      return;
    }

    await this.routeToolCall(session, occurredAt, runtimeEvent);
  }

  private async routeToolCall(
    session: FakeActiveCodexSession,
    occurredAt: string,
    runtimeEvent: Extract<CodexAppServerRuntimeEvent, { type: "tool_call_requested" }>
  ): Promise<void> {
    const toolCallId = runtimeEvent.tool_call_id ?? `${session.manifest.id}:tool_call`;
    this.appendRuntimeEvent({
      manifest: session.manifest,
      occurred_at: occurredAt,
      payload: {
        tool_call_id: toolCallId,
        tool_name: runtimeEvent.tool_name
      },
      runtime: session.runtime,
      type: "agent.runtime.tool_call_requested"
    });

    if (session.runtime.disabled_native_tools.includes(runtimeEvent.tool_name)) {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          tool_call_id: toolCallId,
          tool_name: runtimeEvent.tool_name,
          reason: "Codex native tool is disabled by OpenStrat harness policy"
        },
        runtime: session.runtime,
        type: "agent.runtime.tool_call_blocked"
      });
      return;
    }

    if (!session.runtime.enabled_tools.includes(runtimeEvent.tool_name)) {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          tool_call_id: toolCallId,
          tool_name: runtimeEvent.tool_name,
          reason: "tool is not enabled for this Codex app-server session"
        },
        runtime: session.runtime,
        type: "agent.runtime.tool_call_blocked"
      });
      return;
    }

    if (!this.toolGateway) {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          tool_call_id: toolCallId,
          tool_name: runtimeEvent.tool_name,
          reason: "agent tool gateway is not configured"
        },
        runtime: session.runtime,
        type: "agent.runtime.tool_call_blocked"
      });
      return;
    }

    try {
      const result = await this.toolGateway.invoke({
        call_id: toolCallId,
        session_id: session.manifest.id,
        turn_id: `${session.manifest.id}:turn:${toolCallId}`,
        tool_name: runtimeEvent.tool_name,
        arguments: runtimeEvent.arguments ?? {}
      });
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          tool_call_id: toolCallId,
          tool_name: runtimeEvent.tool_name,
          is_error: false,
          ...gatewayResultRefPayload(result)
        },
        runtime: session.runtime,
        type: "agent.runtime.tool_call_completed"
      });
    } catch (error) {
      this.appendRuntimeEvent({
        manifest: session.manifest,
        occurred_at: occurredAt,
        payload: {
          tool_call_id: toolCallId,
          tool_name: runtimeEvent.tool_name,
          reason: error instanceof Error ? error.message : "agent tool blocked"
        },
        runtime: session.runtime,
        type: "agent.runtime.tool_call_blocked"
      });
    }
  }
}

function defaultRuntimeEvents(
  responseText: string
): readonly CodexAppServerRuntimeEvent[] {
  return [
    {
      type: "message_delta",
      delta: responseText
    },
    {
      type: "turn_completed",
      assistant_text: responseText,
      message_count: 1
    }
  ];
}

function withoutEventType<T extends { event_type: string }>(
  overrides: T
): Omit<T, "event_type"> {
  const { event_type: _eventType, ...runtimeOverrides } = overrides;
  return runtimeOverrides;
}

function definedRuntimeOverrides(
  overrides: Partial<CodexAppServerRuntimeSession>
): Partial<CodexAppServerRuntimeSession> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  ) as Partial<CodexAppServerRuntimeSession>;
}

function safeRuntimeId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function entryId(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

function gatewayResultRefPayload(result: unknown): { result_ref?: string } {
  if (!isRecord(result)) {
    return {};
  }
  if (typeof result.result_ref === "string" && result.result_ref.length > 0) {
    return { result_ref: result.result_ref };
  }
  const latestPrice = result.latest_price;
  if (
    isRecord(latestPrice) &&
    typeof latestPrice.raw_ref === "string" &&
    latestPrice.raw_ref.length > 0
  ) {
    return { result_ref: latestPrice.raw_ref };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
