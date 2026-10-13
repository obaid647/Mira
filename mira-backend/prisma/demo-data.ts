import type { Business, Service } from '../src/types/domain.js';
export function demoBusiness(id = 'demo-business', calendarId: string | null = null, retellAgentId: string | null = null): Business {
  const weekday = [{ open: '09:00', close: '17:00' }];
  return { id, name: 'Cambridge Plumbing — SAMPLE DATA', phoneNumber: '+15195550100', address: '100 Demo Street, Cambridge, ON — fictional sample address',
    timezone: 'America/Toronto', operatingHours: { '1': weekday, '2': weekday, '3': weekday, '4': weekday, '5': weekday, '6': [{ open: '09:00', close: '13:00' }], '7': [] },
    serviceArea: ['Cambridge', 'Kitchener', 'Waterloo'], calendarId, retellAgentId, isSampleData: true,
    policies: { sample_data_notice: 'All business details and services are sample data for testing.',
      pricing: 'Prices are not configured. Take a message for a quote.', emergency: 'No emergency dispatch is promised. Take a message or use the configured human transfer.',
      address_verification: 'Ask the caller to confirm the service address is in the configured service area.',
      confirmation: 'Confirm an appointment only after the booking API reports success.' },
    minimumNoticeMinutes: 120, bufferBeforeMinutes: 0, bufferAfterMinutes: 15, bookingHorizonDays: 30, slotIntervalMinutes: 15 };
}
export function demoServices(businessId = 'demo-business'): Service[] {
  return [
    { id: 'pipe-repair', name: 'Pipe Repair', description: 'Repair of leaking domestic water pipes', aliases: ['leaking basement pipe', 'basement pipe leaking', 'leaking pipe', 'pipe leak', 'burst pipe'], durationMinutes: 60, emergencyEligible: true },
    { id: 'drain-cleaning', name: 'Drain Cleaning', description: 'Clearing blocked household drains', aliases: ['blocked drain', 'clogged drain', 'blocked sink drain'], durationMinutes: 60, emergencyEligible: false },
    { id: 'fixture-repair', name: 'Fixture Repair', description: 'Repair of household faucets and toilets', aliases: ['leaking faucet', 'running toilet', 'tap repair'], durationMinutes: 45, emergencyEligible: false },
    { id: 'water-heater-assessment', name: 'Water Heater Assessment', description: 'Assessment of domestic water heater problems', aliases: ['water heater problem', 'no hot water', 'water heater inspection'], durationMinutes: 90, emergencyEligible: false },
  ].map(s => ({ ...s, id: businessId === 'demo-business' ? s.id : `${businessId}:${s.id}`, businessId, active: true, price: null }));
}
