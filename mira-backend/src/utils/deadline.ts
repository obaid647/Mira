export async function withDeadline<T>(operation: Promise<T>, milliseconds: number, error: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(error()), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
}
