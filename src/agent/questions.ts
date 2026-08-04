export interface QuestionOption {
  label: string;
  description?: string;
}

export interface PendingQuestionInput {
  options?: QuestionOption[];
  multi: boolean;
}

/** Map typed user text to the exact resume value expected by `ask_user`. */
export function resolveQuestionAnswer(
  question: PendingQuestionInput,
  text: string,
): string | string[] | undefined {
  if (!question.options?.length) return text.trim() || undefined;
  const options = question.options;
  const pick = (token: string): string | undefined => {
    const value = token.trim();
    if (!value) return undefined;
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= options.length) {
      return options[number - 1]!.label;
    }
    const exact = options.find(
      (option) => option.label.toLowerCase() === value.toLowerCase(),
    );
    if (exact) return exact.label;
    return options.find((option) =>
      option.label.toLowerCase().startsWith(value.toLowerCase()),
    )?.label;
  };

  if (question.multi) {
    const picks = text.split(",").map(pick);
    return picks.some((pick) => pick === undefined)
      ? undefined
      : (picks as string[]);
  }
  return pick(text);
}

export function formatQuestion(
  question: string,
  options?: QuestionOption[],
  multi: boolean = false,
): string {
  if (!options?.length) return `${question}\n\nReply with your answer.`;
  const choices = options
    .map(
      (option, index) =>
        `${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`,
    )
    .join("\n");
  return `${question}\n\n${choices}\n\nReply with ${
    multi ? "one or more numbers or labels, separated by commas" : "a number or label"
  }.`;
}
