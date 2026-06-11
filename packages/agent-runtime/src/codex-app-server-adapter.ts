import {
  AgentSessionManifestSchema,
  type AgentSessionManifest
} from "@openstrat/domain";
import type { EventLogRepository } from "@openstrat/persistence";
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
  transcriptStore?: CodexAppServerTranscriptStore;
}

export interface FakeCodexAppServerRuntimeAdapterOptions {
  bindingStore?: CodexAppServerBindingStore;
  events?: EventLogRepository;
  now?: () => string;
  responseText?: string;
  transcriptStore?: CodexAppServerTranscriptStore;
}

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
  private readonly responseText: string;
  private readonly sessions = new Map<string, FakeActiveCodexSession>();
  private readonly promptHistory = new Map<string, string[]>();
  private readonly transcriptStore: CodexAppServerTranscriptStore | undefined;

  constructor(options: FakeCodexAppServerRuntimeAdapterOptions = {}) {
    this.bindingStore = options.bindingStore;
    this.events = options.events;
    this.now = options.now ?? (() => new Date().toISOString());
    this.responseText = options.responseText ?? "Fake Codex app-server response.";
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
    this.appendRuntimeEvent({
      manifest: session.manifest,
      occurred_at: occurredAt,
      payload: {
        delta: this.responseText
      },
      runtime: session.runtime,
      type: "agent.runtime.message_delta"
    });
    this.appendRuntimeEvent({
      manifest: session.manifest,
      occurred_at: occurredAt,
      payload: {
        assistant_text: this.responseText,
        message_count: 1
      },
      runtime: session.runtime,
      type: "agent.runtime.turn_completed"
    });
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
