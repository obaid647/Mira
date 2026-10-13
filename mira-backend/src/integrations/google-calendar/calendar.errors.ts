import { AppError } from '../../utils/errors.js';
export class CalendarWriteError extends AppError {
  constructor(public readonly definitive: boolean) { super('CALENDAR_UNAVAILABLE', 'I cannot confirm the calendar booking right now. Please leave a message.', 503); }
}
