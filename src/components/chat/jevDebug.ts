import type { JevAnswer } from "../../protocol/types";

/** Each Jev question in plain words; any other question is shown by its ID. */
const QUESTION_WORDS: Record<string, string> = {
  mini_me: "Who answers?",
  reaction: "React with an emoji?",
  needs_context: "Needs earlier messages?",
  file: "Which file?",
};

export function questionWords(question: string): string {
  return QUESTION_WORDS[question] ?? question;
}

/** One answered question as the "[DEBUG] Jev" block shows it: the option Jev chose with its
 * confidence, and the other options with their probabilities, highest first. */
interface AnswerRow {
  question: string;
  choice: string;
  confidence: number;
  others: { option: string; probability: number }[];
}

export function answerRows(answers: Record<string, JevAnswer>): AnswerRow[] {
  return Object.entries(answers).map(([question, answer]) => ({
    question: questionWords(question),
    choice: answer.choice,
    confidence: answer.confidence,
    others: Object.entries(answer.probabilities)
      .filter(([option]) => option !== answer.choice)
      .sort(([, a], [, b]) => b - a)
      .map(([option, probability]) => ({ option, probability })),
  }));
}
