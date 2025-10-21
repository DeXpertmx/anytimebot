
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test user (admin)
  const testUser = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'John Doe',
      username: 'johndoe',
      timezone: 'America/New_York',
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create a booking page for the test user
  const bookingPage = await prisma.bookingPage.upsert({
    where: { slug: 'johndoe' },
    update: {},
    create: {
      userId: testUser.id,
      slug: 'johndoe',
      title: 'Schedule a Meeting with John',
      description: 'Book a time that works for both of us. I look forward to speaking with you!',
      isActive: true,
    },
  });

  console.log('✅ Created booking page:', bookingPage.slug);

  // Create event types
  const eventTypes = [
    {
      name: '15 Minute Meeting',
      duration: 15,
      bufferTime: 5,
      location: 'video',
      videoLink: 'https://meet.google.com/abc-defg-hij',
      color: '#6366f1',
      requiresConfirmation: false,
    },
    {
      name: '30 Minute Consultation',
      duration: 30,
      bufferTime: 10,
      location: 'video',
      videoLink: 'https://zoom.us/j/1234567890',
      color: '#8b5cf6',
      requiresConfirmation: true,
    },
    {
      name: '60 Minute Strategy Session',
      duration: 60,
      bufferTime: 15,
      location: 'video',
      videoLink: 'https://teams.microsoft.com/l/meetup-join/xyz',
      color: '#06b6d4',
      requiresConfirmation: true,
    },
  ];

  const createdEventTypes = [];
  for (const eventType of eventTypes) {
    const created = await prisma.eventType.create({
      data: {
        ...eventType,
        bookingPageId: bookingPage.id,
      },
    });
    createdEventTypes.push(created);
    console.log('✅ Created event type:', created.name);
  }

  // Add form fields to the consultation event type
  const consultationEventType = createdEventTypes.find(et => et.name === '30 Minute Consultation');
  if (consultationEventType) {
    const formFields = [
      {
        label: 'Company Name',
        type: 'TEXT',
        required: true,
        placeholder: 'Your company name',
      },
      {
        label: 'How can we help you?',
        type: 'TEXTAREA',
        required: true,
        placeholder: 'Tell us about your project or needs...',
      },
      {
        label: 'Budget Range',
        type: 'SELECT',
        required: false,
        options: ['< $5,000', '$5,000 - $15,000', '$15,000 - $50,000', '$50,000+'],
      },
      {
        label: 'Newsletter Signup',
        type: 'CHECKBOX',
        required: false,
      },
    ];

    for (const field of formFields) {
      await prisma.bookingFormField.create({
        data: {
          ...field,
          eventTypeId: consultationEventType.id,
          type: field.type as any,
        },
      });
    }
    console.log('✅ Created form fields for consultation event type');
  }

  // Create availability for the booking page (Monday to Friday, 9 AM to 5 PM)
  const availabilityData = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // Tuesday
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // Thursday
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Friday
  ];

  for (const availability of availabilityData) {
    await prisma.availability.create({
      data: {
        ...availability,
        bookingPageId: bookingPage.id,
        isAvailable: true,
      },
    });
  }
  console.log('✅ Created availability schedule (Mon-Fri, 9 AM - 5 PM)');

  // Create some sample bookings
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2 PM

  const dayAfterTomorrow = new Date();
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  dayAfterTomorrow.setHours(10, 0, 0, 0); // 10 AM

  const sampleBookings = [
    {
      eventTypeId: createdEventTypes[0].id, // 15 minute meeting
      guestName: 'Alice Johnson',
      guestEmail: 'alice@example.com',
      guestPhone: '+1-555-0123',
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 15 * 60000), // +15 minutes
      timezone: 'America/New_York',
      status: 'CONFIRMED',
      formData: {},
    },
    {
      eventTypeId: createdEventTypes[1].id, // 30 minute consultation
      guestName: 'Bob Smith',
      guestEmail: 'bob@company.com',
      guestPhone: '+1-555-0456',
      startTime: dayAfterTomorrow,
      endTime: new Date(dayAfterTomorrow.getTime() + 30 * 60000), // +30 minutes
      timezone: 'America/New_York',
      status: 'PENDING',
      formData: {
        'Company Name': 'Acme Corp',
        'How can we help you?': 'We need help with our digital transformation strategy',
        'Budget Range': '$15,000 - $50,000',
        'Newsletter Signup': true,
      },
    },
  ];

  for (const booking of sampleBookings) {
    await prisma.booking.create({
      data: {
        ...booking,
        status: booking.status as any,
      },
    });
  }
  console.log('✅ Created sample bookings');

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
