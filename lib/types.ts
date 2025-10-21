
import type { User, BookingPage, EventType, Booking, Availability, BookingFormField } from '@prisma/client';

// Extended types with relations
export type BookingPageWithEventTypes = BookingPage & {
  eventTypes: EventType[];
  user: User;
};

export type EventTypeWithFormFields = EventType & {
  formFields: BookingFormField[];
  bookingPage: BookingPage;
};

export type BookingWithEventType = Booking & {
  eventType: EventType & {
    bookingPage: BookingPage & {
      user: User;
    };
  };
};

export type AvailabilitySlot = {
  time: string;
  available: boolean;
};

export type TimeSlot = {
  startTime: string;
  endTime: string;
  available: boolean;
};

// Form types
export interface BookingFormData {
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  [key: string]: any; // For custom form fields
}

export interface EventTypeFormData {
  name: string;
  duration: number;
  bufferTime: number;
  location: string;
  videoLink?: string;
  color: string;
  requiresConfirmation: boolean;
}

export interface BookingPageFormData {
  slug: string;
  title: string;
  description?: string;
  isActive: boolean;
}

export interface AvailabilityFormData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Notification types
export interface EmailNotificationData {
  to: string;
  subject: string;
  guestName: string;
  eventName: string;
  date: string;
  time: string;
  timezone: string;
  location: string;
  hostName: string;
  bookingId: string;
}
