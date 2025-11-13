import { askLibrary, CitationEntry } from "../lib/ask";

type AskToolInput = {
  /**
   * The natural language question to answer using the indexed documents.
   */
  question: string;
};

type AskToolResult = {
  /**
   * Echo of the processed question for traceability.
   */
  question: string;
  /**
   * The model's response grounded in the Great Library.
   */
  answer: string;
  /**
   * Citations that support the answer, when available.
   */
  citations: CitationEntry[];
};

/**
 * Answer a question using the documents stored in the Great Library.
 */
export default async function askTool(input: AskToolInput): Promise<AskToolResult> {
  const question = input?.question?.trim();
  if (!question) {
    throw new Error("Provide a question to ask the Great Library.");
  }

  const { answer, citations } = await askLibrary({ question });

  return {
    question,
    answer: answer || "_The model returned no answer._",
    citations,
  };
}
