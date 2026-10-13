export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 500) { super(message); }
}
export const invalid = (message = 'Please check the information provided.') => new AppError('INVALID_REQUEST', message, 400);
export const calendarUnavailable = () => new AppError('CALENDAR_UNAVAILABLE', 'I cannot check the calendar right now. Please leave a message.', 503);
export const slotUnavailable = () => new AppError('SLOT_UNAVAILABLE', 'The selected appointment time is no longer available.', 409);
