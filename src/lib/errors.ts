/** Turn Error objects, Supabase/PostgREST errors and network failures into a sentence for the UI. */
export function errorMessage(error: unknown): string {
  let message = 'Something went wrong. Please try again.';
  if (error instanceof Error) message = error.message;
  else if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    message = (error as { message: string }).message;
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return message;
}
