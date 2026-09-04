// Shared types/constants for the Locations & Resources management UI.

export interface LocationItem {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone: string;
  isActive: boolean;
  _count?: { resources: number };
}

export interface ScheduleRule {
  id?: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface ResourceItem {
  id: string;
  name: string;
  type: string;
  capacity: number;
  isActive: boolean;
  location?: { id: string; name: string } | null;
  availabilities: ScheduleRule[];
  _count?: { bookings: number };
}

export const RESOURCE_TYPES: { value: string; label: string; emoji: string }[] = [
  { value: 'ROOM', label: 'Sala / Consultorio', emoji: '🚪' },
  { value: 'CHAIR', label: 'Sillón / Butaca', emoji: '💺' },
  { value: 'EQUIPMENT', label: 'Equipo / Máquina', emoji: '🛠️' },
  { value: 'STATION', label: 'Puesto / Estación', emoji: '🗄️' },
  { value: 'OTHER', label: 'Otro', emoji: '📦' },
];

export const resourceTypeLabel = (type: string): string =>
  RESOURCE_TYPES.find((t) => t.value === type)?.label ?? type;

export const resourceTypeEmoji = (type: string): string =>
  RESOURCE_TYPES.find((t) => t.value === type)?.emoji ?? '📦';

// Spanish weekday labels in Monday-first order (dayOfWeek: 1..6,0).
export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const dayLabel = (dayOfWeek: number): string =>
  DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? String(dayOfWeek);

export const dayShort = (dayOfWeek: number): string =>
  DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.short ?? String(dayOfWeek);

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'ES', name: 'España' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Perú' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CA', name: 'Canadá' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'CH', name: 'Suiza' },
  { code: 'AT', name: 'Austria' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'PA', name: 'Panamá' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'GT', name: 'Guatemala' },
];

export const countryName = (code?: string | null): string =>
  COUNTRIES.find((c) => c.code === code)?.name ?? code ?? '';
