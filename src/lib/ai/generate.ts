import { sanitizeEmailHtml } from "@/lib/email/validate";

export class AIConfigError extends Error {}
export class AIGenerationError extends Error {}

export type AIGenerateInput = {
  emailType: "PROPOSAL" | "SALES";
  tone: "PROFESSIONAL" | "FRIENDLY" | "PERSUASIVE" | "PREMIUM" | "CONCISE";
  language: "ENGLISH" | "HINDI" | "HINGLISH" | string;
  clientName?: string;
  companyName?: string;
  serviceName?: string;
  projectTitle?: string;
  clientRequirements?: string;
  budget?: string;
  timeline?: string;
  proposalAmount?: string;
  technologyStack?: string;
  agentInstructions?: string;
  agentName: string;
};

export type AIGenerateOutput = {
  subject: string;
  htmlBody: string;
  textBody: string;
};

const PROPOSAL_SYSTEM_PROMPT = `You write proposal emails for a software agency called ABYVORA Technologies. Use ONLY the facts given to you in the user message — never invent client requirements, pricing, guarantees, delivery promises, certifications, case studies, testimonials, legal claims, or technical features that were not provided. If a fact (budget, timeline, price) is missing, omit that section instead of guessing. Structure: greeting, context, requirement summary, proposed solution, benefits, timeline (if given), pricing (if given), next step, professional closing, and the agent's name as signature. Respond with strict JSON: {"subject": "...", "html": "...", "text": "..."}. The html field should use simple <p>, <ul>/<li>, and <strong> tags only — no scripts, styles, or external resources.`;

const SALES_SYSTEM_PROMPT = `You write cold/warm sales outreach emails for a software agency called ABYVORA Technologies. Use ONLY the facts given to you in the user message — never invent client requirements, pricing, guarantees, delivery promises, certifications, case studies, testimonials, or claims not provided. Structure: personalized greeting, brief reason for contacting, service value, short benefits, a clear call-to-action (e.g. a short call), professional closing, and the agent's name as signature. Respond with strict JSON: {"subject": "...", "html": "...", "text": "..."}. The html field should use simple <p>, <ul>/<li>, and <strong> tags only — no scripts, styles, or external resources.`;

function buildUserPrompt(input: AIGenerateInput): string {
  const lines: string[] = [];
  lines.push(`Tone: ${input.tone}`);
  lines.push(`Language: ${input.language}`);
  if (input.clientName) lines.push(`Client name: ${input.clientName}`);
  if (input.companyName) lines.push(`Company: ${input.companyName}`);
  if (input.serviceName) lines.push(`Service: ${input.serviceName}`);
  if (input.projectTitle) lines.push(`Project title: ${input.projectTitle}`);
  if (input.clientRequirements) lines.push(`Client requirements: ${input.clientRequirements}`);
  if (input.budget) lines.push(`Budget: ${input.budget}`);
  if (input.timeline) lines.push(`Timeline: ${input.timeline}`);
  if (input.proposalAmount) lines.push(`Proposal amount: ${input.proposalAmount}`);
  if (input.technologyStack) lines.push(`Technology stack: ${input.technologyStack}`);
  if (input.agentInstructions) lines.push(`Additional instructions from agent: ${input.agentInstructions}`);
  lines.push(`Agent's name (use as signature): ${input.agentName}`);
  lines.push(`Do not include any fact not listed above.`);
  return lines.join("\n");
}

/**
 * Calls an OpenAI-compatible chat completions endpoint. Works with OpenAI,
 * Groq, or any other provider that implements the same API shape — set
 * AI_BASE_URL accordingly (e.g. https://api.groq.com/openai/v1).
 */
export async function generateEmailWithAI(input: AIGenerateInput): Promise<AIGenerateOutput> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new AIConfigError(
      "AI_API_KEY is not configured. Set AI_API_KEY, AI_BASE_URL and AI_MODEL in your environment to enable AI email generation."
    );
  }

  const systemPrompt = input.emailType === "PROPOSAL" ? PROPOSAL_SYSTEM_PROMPT : SALES_SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AIGenerationError("AI provider timed out after 25 seconds");
    }
    throw new AIGenerationError(`Could not reach AI provider: ${err?.message ?? "network error"}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AIGenerationError(`AI provider returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AIGenerationError("AI provider returned an unexpected response shape");
  }

  let parsed: { subject?: string; html?: string; text?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AIGenerationError("AI provider did not return valid JSON");
  }

  if (!parsed.subject || !parsed.html) {
    throw new AIGenerationError("AI provider response is missing subject or html");
  }

  return {
    subject: parsed.subject,
    htmlBody: sanitizeEmailHtml(parsed.html),
    textBody: parsed.text ?? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
}
