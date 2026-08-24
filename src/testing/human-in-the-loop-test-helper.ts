/**
 * Temporarily closes the human-in-the-loop gate for the duration of `run`,
 * restoring the prior value (or its absence) afterward regardless of outcome.
 */
export async function withHumanInTheLoopBlocking<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.UMBRACO_HUMAN_IN_THE_LOOP;
  delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
    else process.env.UMBRACO_HUMAN_IN_THE_LOOP = previous;
  }
}
