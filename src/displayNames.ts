const names: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  jev: 'Jev',
  openrouter: 'OpenRouter',
  astra: 'Astra',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  sol: 'Sol',
  luna: 'Luna',
  fable: 'Fable',
  gpt: 'GPT',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  typesafe: 'TypeSafe',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  gemini: 'Gemini',
};

// Display only: provider keys and model identifiers sent to APIs remain untouched.
export function displayName(value: string) {
  return value.replace(
    /\b(?:claude|codex|jev|openrouter|astra|opus|sonnet|haiku|sol|luna|fable|gpt|openai|anthropic|typesafe|deepseek|qwen|gemini)\b/gi,
    (name) => names[name.toLowerCase()],
  );
}
