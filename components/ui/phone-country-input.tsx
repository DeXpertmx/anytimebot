'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const countries = [
  { code: 'ES', dial: '+34', name: 'España' },
  { code: 'MX', dial: '+52', name: 'México' },
  { code: 'US', dial: '+1', name: 'Estados Unidos' },
  { code: 'CA', dial: '+1', name: 'Canadá' },
  { code: 'GB', dial: '+44', name: 'Reino Unido' },
  { code: 'FR', dial: '+33', name: 'Francia' },
  { code: 'DE', dial: '+49', name: 'Alemania' },
  { code: 'IT', dial: '+39', name: 'Italia' },
  { code: 'PT', dial: '+351', name: 'Portugal' },
];

interface PhoneCountryInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  country: string;
  onCountryChange: (country: string) => void;
  placeholder?: string;
}

export function PhoneCountryInput({ id, value, onChange, country, onCountryChange, placeholder = '612 345 678' }: PhoneCountryInputProps) {
  const selected = countries.find((item) => item.code === country) || countries[0];
  return (
    <div className="flex gap-2">
      <Select value={selected.code} onValueChange={onCountryChange}>
        <SelectTrigger className="w-36" aria-label="Prefijo telefónico"><SelectValue /></SelectTrigger>
        <SelectContent>
          {countries.map((item) => <SelectItem key={item.code} value={item.code}>{item.name} ({item.dial})</SelectItem>)}
        </SelectContent>
      </Select>
      <Input id={id} type="tel" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function getDialCode(country: string) {
  return countries.find((item) => item.code === country)?.dial || '+34';
}
