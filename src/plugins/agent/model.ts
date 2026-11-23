/**
 * The model endpoint the in-app agent talks to: any OpenAI-compatible
 * Chat Completions API (`<baseURL>/chat/completions`). The operator names the
 * base URL, the key, and the model id. There is no built-in vendor default.
 *
 * The key stays in the environment. Fregoli hands OpenCode a config that only
 * names the variable (`{env:FREGOLI_MODEL_API_KEY}`), never the value.
 */

export const MODEL_BASE_URL_ENV = "FREGOLI_MODEL_BASE_URL";
export const MODEL_API_KEY_ENV = "FREGOLI_MODEL_API_KEY";
export const MODEL_ID_ENV = "FREGOLI_MODEL_ID";

/** OpenCode provider id for the operator's endpoint; the model ref is `fregoli/<model id>`. */
export const MODEL_PROVIDER_ID = "fregoli";

export type ModelEndpoint = {
  baseURL: string;
  model: string;
};

export type ModelEndpointResult =
  | { endpoint: ModelEndpoint; problem: null }
  | { endpoint: null; problem: string };

/**
 * Read the endpoint from the environment. All three variables are needed:
 * base URL, API key, and model id. Inside a habitat whose gate injects the key,
 * set the key variable to any placeholder; the gate replaces `Authorization`.
 * A missing or invalid value is a `problem`, not a throw: the app still starts
 * and the chat answers with the stub.
 */
export function readModelEndpoint(env: NodeJS.ProcessEnv = process.env): ModelEndpointResult {
  const baseURL = env[MODEL_BASE_URL_ENV]?.trim() ?? "";
  const key = env[MODEL_API_KEY_ENV]?.trim() ?? "";
  const model = env[MODEL_ID_ENV]?.trim() ?? "";
  const missing: string[] = [];
  if (!baseURL) missing.push(MODEL_BASE_URL_ENV);
  if (!key) missing.push(MODEL_API_KEY_ENV);
  if (!model) missing.push(MODEL_ID_ENV);
  if (missing.length) return { endpoint: null, problem: `${missing.join(", ")} not set` };
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return { endpoint: null, problem: `${MODEL_BASE_URL_ENV} is not a URL` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { endpoint: null, problem: `${MODEL_BASE_URL_ENV} must be http or https` };
  }
  if (url.username || url.password) {
    return {
      endpoint: null,
      problem: `${MODEL_BASE_URL_ENV} must not carry credentials; use ${MODEL_API_KEY_ENV}`,
    };
  }
  return { endpoint: { baseURL: baseURL.replace(/\/+$/, ""), model }, problem: null };
}

/** One log line when the endpoint is missing or invalid. Never contains the key. */
export function noEndpointMessage(problem: string): string {
  return `fregoli agent: no model endpoint (${problem}); the chat answers with the stub`;
}

/**
 * OpenCode config (the `OPENCODE_CONFIG_CONTENT` shape) that points OpenCode at
 * the endpoint through its OpenAI-compatible Chat Completions provider package.
 * It only sets `model` and `providers`, so it merges shallowly with other
 * top-level OpenCode settings such as an agent profile.
 */
export function openCodeModelConfig(endpoint: ModelEndpoint): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    model: `${MODEL_PROVIDER_ID}/${endpoint.model}`,
    providers: {
      [MODEL_PROVIDER_ID]: {
        name: "Fregoli model endpoint",
        env: [MODEL_API_KEY_ENV],
        package: "@opencode/ai/providers/openai-compatible",
        settings: {
          baseURL: endpoint.baseURL,
          apiKey: `{env:${MODEL_API_KEY_ENV}}`,
        },
        models: {
          [endpoint.model]: { name: endpoint.model },
        },
      },
    },
  };
}

/** Extra environment for the ACP child. The key itself is inherited, not copied here. */
export function modelEnv(endpoint: ModelEndpoint): Record<string, string> {
  return { OPENCODE_CONFIG_CONTENT: JSON.stringify(openCodeModelConfig(endpoint)) };
}

/** True when the ACP child is OpenCode, which must not start without an endpoint. */
export function isOpenCode(command: string): boolean {
  const base = command.split(/[\\/]/).pop() ?? command;
  return /^opencode(\.exe|\.cmd)?$/i.test(base);
}
