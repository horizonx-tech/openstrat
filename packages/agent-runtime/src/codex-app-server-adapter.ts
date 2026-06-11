import {
  AgentSessionManifestSchema,
  type AgentSessionManifest
} from "@openstrat/domain";

export const DISABLED_CODEX_NATIVE_TOOLS = [
  "shell",
  "apply_patch",
  "read",
  "write",
  "edit"
] as const;

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

export interface FakeCodexAppServerRuntimeAdapterOptions {
  now?: () => string;
}

interface FakeActiveCodexSession {
  manifest: AgentSessionManifest;
  runtime: CodexAppServerRuntimeSession;
  prompts: string[];
}

export class FakeCodexAppServerRuntimeAdapter implements CodexAppServerRuntimeAdapter {
  private readonly now: () => string;
  private readonly sessions = new Map<string, FakeActiveCodexSession>();
  private readonly promptHistory = new Map<string, string[]>();

  constructor(options: FakeCodexAppServerRuntimeAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async startSession(
    input: StartCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {});
  }

  async resumeSession(
    input: ResumeCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {
      codex_thread_id: input.codex_thread_id,
      transcript_ref: input.transcript_ref,
      resumed_from_codex_thread_id: input.codex_thread_id
    });
  }

  async forkSession(
    input: ForkCodexAppServerSessionInput
  ): Promise<CodexAppServerRuntimeSession> {
    return this.createSession(input, {
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
  }

  async dispose(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  promptsFor(sessionId: string): string[] {
    return this.promptHistory.get(sessionId) ?? [];
  }

  private createSession(
    input: StartCodexAppServerSessionInput,
    overrides: Partial<CodexAppServerRuntimeSession>
  ): CodexAppServerRuntimeSession {
    const manifest = AgentSessionManifestSchema.parse(input.manifest);
    if (manifest.runtime.kind !== "codex_app_server") {
      throw new Error("Codex app-server adapter requires codex_app_server runtime");
    }

    const codexThreadId =
      overrides.codex_thread_id ?? `codex_thread_${safeRuntimeId(manifest.id)}`;
    const runtime: CodexAppServerRuntimeSession = {
      session_id: manifest.id,
      runtime_session_id: `codex_app_server_${safeRuntimeId(manifest.id)}`,
      codex_thread_id: codexThreadId,
      transcript_ref: overrides.transcript_ref ?? manifest.transcript_ref.uri,
      enabled_tools: [...input.toolNames],
      disabled_native_tools: [...DISABLED_CODEX_NATIVE_TOOLS],
      ...definedRuntimeOverrides(overrides)
    };

    this.sessions.set(manifest.id, {
      manifest,
      runtime,
      prompts: []
    });
    this.now();
    return runtime;
  }
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
