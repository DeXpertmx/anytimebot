
/**
 * Pre-Meeting Intelligence Brief Generator
 * Generates personalized briefings for both host and guest using AI
 */

import { prisma } from '@/lib/db';
import { findSimilarDocuments } from '@/lib/embeddings';

interface BookingContext {
  booking: {
    id: string;
    guestName: string;
    guestEmail: string;
    guestPhone?: string | null;
    startTime: Date;
    endTime: Date;
    timezone: string;
    formData?: any;
  };
  eventType: {
    name: string;
    duration: number;
    location: string;
    videoLink?: string | null;
  };
  host: {
    name?: string | null;
    email: string;
    username?: string | null;
  };
  chatHistory?: Array<{ role: string; content: string; timestamp: Date }>;
  relevantDocuments?: Array<{ fileName: string; content: string; similarity: number }>;
  teamContext?: {
    isTeamEvent: boolean;
    members?: Array<{ name: string; role: string }>;
  };
  previousBookings?: number;
}

/**
 * Get chat history for a guest from bot conversations
 */
async function getChatHistory(guestPhone: string | null, hostEmail: string): Promise<Array<{ role: string; content: string; timestamp: Date }>> {
  if (!guestPhone) return [];

  try {
    const user = await prisma.user.findUnique({
      where: { email: hostEmail },
      include: {
        bots: {
          include: {
            conversations: {
              where: {
                phone: guestPhone,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!user || !user.bots[0] || !user.bots[0].conversations[0]) {
      return [];
    }

    const messages = user.bots[0].conversations[0].messages as any;
    if (Array.isArray(messages)) {
      return messages.slice(-10).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp || Date.now()),
      }));
    }

    return [];
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
}

/**
 * Get relevant documents from host's knowledge base
 */
async function getRelevantDocuments(
  hostEmail: string,
  context: string
): Promise<Array<{ fileName: string; content: string; similarity: number }>> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: hostEmail },
      include: {
        bots: {
          include: {
            documents: true,
          },
          take: 1,
        },
      },
    });

    if (!user || !user.bots[0] || user.bots[0].documents.length === 0) {
      return [];
    }

    const documents = user.bots[0].documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      content: doc.content,
    }));

    const similar = findSimilarDocuments(context, documents, 3);
    return similar.filter(doc => doc.similarity > 0.1);
  } catch (error) {
    console.error('Error fetching relevant documents:', error);
    return [];
  }
}

/**
 * Count previous bookings by this guest
 */
async function getPreviousBookingsCount(guestEmail: string, hostEmail: string): Promise<number> {
  try {
    const count = await prisma.booking.count({
      where: {
        guestEmail,
        eventType: {
          bookingPage: {
            user: {
              email: hostEmail,
            },
          },
        },
        status: 'COMPLETED',
      },
    });
    return count;
  } catch (error) {
    console.error('Error counting previous bookings:', error);
    return 0;
  }
}

/**
 * Generate briefing context from booking data
 */
async function generateBriefingContext(bookingId: string): Promise<BookingContext | null> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
            team: {
              include: {
                members: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        assignedMember: true,
      },
    });

    if (!booking) {
      return null;
    }

    const host = booking.assignedMember || booking.eventType.bookingPage.user;
    const chatHistory = await getChatHistory(booking.guestPhone, host.email);
    
    // Build context string for document search
    const contextString = [
      booking.eventType.name,
      booking.guestName,
      JSON.stringify(booking.formData || {}),
      chatHistory.map(m => m.content).join(' '),
    ].join(' ');

    const relevantDocuments = await getRelevantDocuments(host.email, contextString);
    const previousBookings = await getPreviousBookingsCount(booking.guestEmail, host.email);

    return {
      booking: {
        id: booking.id,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone,
        startTime: booking.startTime,
        endTime: booking.endTime,
        timezone: booking.timezone,
        formData: booking.formData,
      },
      eventType: {
        name: booking.eventType.name,
        duration: booking.eventType.duration,
        location: booking.eventType.location,
        videoLink: booking.eventType.videoLink,
      },
      host: {
        name: host.name,
        email: host.email,
        username: host.username,
      },
      chatHistory,
      relevantDocuments,
      teamContext: booking.eventType.team
        ? {
            isTeamEvent: true,
            members: booking.eventType.team.members.map(m => ({
              name: m.user?.name || m.email,
              role: m.role,
            })),
          }
        : { isTeamEvent: false },
      previousBookings,
    };
  } catch (error) {
    console.error('Error generating briefing context:', error);
    return null;
  }
}

/**
 * Generate guest briefing using AI
 */
async function generateGuestBriefing(context: BookingContext): Promise<string> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI API key not configured');
  }

  const hostName = context.host.name || 'your host';
  const dateStr = new Date(context.booking.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: context.booking.timezone,
  });
  const timeStr = new Date(context.booking.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: context.booking.timezone,
  });

  const systemPrompt = `You are a professional meeting assistant for ANYTIMEBOT. Generate a friendly, personalized pre-meeting briefing for a guest attending an upcoming meeting. The briefing should:

1. Greet the guest warmly by name
2. Remind them of the meeting details (host, date, time, topic)
3. Summarize what will be discussed based on their form responses and chat history
4. Include relevant resources or information from the knowledge base
5. Provide clear next steps and how to reschedule if needed
6. Be concise (200-300 words), professional yet friendly
7. Use a warm, welcoming tone

Format the briefing in clean HTML with proper headings and bullet points.`;

  const userPrompt = `Generate a pre-meeting briefing for:

**Guest**: ${context.booking.guestName}
**Meeting**: ${context.eventType.name}
**With**: ${hostName}
**Date**: ${dateStr}
**Time**: ${timeStr} (${context.booking.timezone})
**Duration**: ${context.eventType.duration} minutes
**Location**: ${context.eventType.location}
${context.eventType.videoLink ? `**Video Link**: ${context.eventType.videoLink}` : ''}

${context.booking.formData ? `**Guest's Form Responses**:\n${JSON.stringify(context.booking.formData, null, 2)}` : ''}

${context.chatHistory && context.chatHistory.length > 0 ? `**Recent Chat History**:\n${context.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

${context.relevantDocuments && context.relevantDocuments.length > 0 ? `**Relevant Resources**:\n${context.relevantDocuments.map(d => `- ${d.fileName}`).join('\n')}` : ''}

${context.previousBookings ? `**Note**: This is a returning guest (${context.previousBookings} previous meetings)` : '**Note**: This is a first-time guest'}`;

  try {
    const response = await fetch('https://api.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating guest briefing:', error);
    // Fallback to basic briefing
    return generateFallbackGuestBriefing(context);
  }
}

/**
 * Generate host briefing using AI
 */
async function generateHostBriefing(context: BookingContext): Promise<{ briefing: string; talkingPoints: string[] }> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI API key not configured');
  }

  const dateStr = new Date(context.booking.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: context.booking.timezone,
  });
  const timeStr = new Date(context.booking.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: context.booking.timezone,
  });

  const systemPrompt = `You are a professional meeting assistant for ANYTIMEBOT. Generate an insightful pre-meeting intelligence briefing for a host preparing for an upcoming meeting. The briefing should:

1. Provide key information about the guest (name, company, history)
2. Identify the guest's main request, pain point, or goal from their messages
3. Suggest 3-5 specific talking points based on the context
4. Reference relevant documents from the knowledge base
5. Include team context if it's a collaborative meeting
6. Be actionable and concise (300-400 words)
7. Use a professional, strategic tone

Format the briefing in clean HTML with proper headings and bullet points.

Also provide a JSON array of 3-5 talking points separately.`;

  const userPrompt = `Generate a host briefing for:

**Meeting**: ${context.eventType.name}
**Guest**: ${context.booking.guestName} (${context.booking.guestEmail})
${context.booking.guestPhone ? `**Phone**: ${context.booking.guestPhone}` : ''}
**Date**: ${dateStr}
**Time**: ${timeStr} (${context.booking.timezone})
**Duration**: ${context.eventType.duration} minutes

${(context.previousBookings || 0) > 0 ? `**Guest History**: Returning client with ${context.previousBookings} previous meeting(s)` : `**Guest History**: First-time visitor`}

${context.booking.formData ? `**Guest's Form Responses**:\n${JSON.stringify(context.booking.formData, null, 2)}` : ''}

${context.chatHistory && context.chatHistory.length > 0 ? `**Chat History Summary**:\n${context.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}` : '**Chat History**: No prior conversations'}

${context.relevantDocuments && context.relevantDocuments.length > 0 ? `**Relevant Knowledge Base Documents**:\n${context.relevantDocuments.map(d => `- ${d.fileName} (relevance: ${(d.similarity * 100).toFixed(0)}%)`).join('\n')}` : ''}

${context.teamContext?.isTeamEvent ? `**Team Context**: This is a collaborative meeting with ${context.teamContext.members?.map(m => m.name).join(', ')}` : ''}

Generate:
1. A comprehensive HTML briefing
2. A JSON array of 3-5 actionable talking points

Format your response as:
BRIEFING:
[HTML content here]

TALKING_POINTS:
[JSON array here]`;

  try {
    const response = await fetch('https://api.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse the response
    const briefingMatch = content.match(/BRIEFING:\s*([\s\S]*?)\s*TALKING_POINTS:/);
    const talkingPointsMatch = content.match(/TALKING_POINTS:\s*([\s\S]*)/);

    const briefing = briefingMatch ? briefingMatch[1].trim() : content;
    let talkingPoints: string[] = [];

    if (talkingPointsMatch) {
      try {
        talkingPoints = JSON.parse(talkingPointsMatch[1].trim());
      } catch {
        // Fallback to extracting bullet points
        talkingPoints = extractTalkingPoints(content);
      }
    } else {
      talkingPoints = extractTalkingPoints(content);
    }

    return { briefing, talkingPoints };
  } catch (error) {
    console.error('Error generating host briefing:', error);
    // Fallback to basic briefing
    const fallback = generateFallbackHostBriefing(context);
    return { briefing: fallback, talkingPoints: extractTalkingPoints(fallback) };
  }
}

/**
 * Extract talking points from text content
 */
function extractTalkingPoints(content: string): string[] {
  const points: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^[\d\-\*•]\s*.{10,}/) && points.length < 5) {
      points.push(trimmed.replace(/^[\d\-\*•]\s*/, ''));
    }
  }
  
  if (points.length === 0) {
    return [
      'Review guest\'s background and previous interactions',
      'Address their main request or concern',
      'Share relevant resources from knowledge base',
    ];
  }
  
  return points;
}

/**
 * Fallback guest briefing (if AI fails)
 */
function generateFallbackGuestBriefing(context: BookingContext): string {
  const hostName = context.host.name || 'your host';
  const dateStr = new Date(context.booking.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: context.booking.timezone,
  });
  const timeStr = new Date(context.booking.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: context.booking.timezone,
  });

  return `
    <h2>Hello ${context.booking.guestName}! 👋</h2>
    <p>Your upcoming meeting is confirmed and we're looking forward to connecting with you.</p>
    
    <h3>📅 Meeting Details</h3>
    <ul>
      <li><strong>What:</strong> ${context.eventType.name}</li>
      <li><strong>With:</strong> ${hostName}</li>
      <li><strong>When:</strong> ${dateStr} at ${timeStr}</li>
      <li><strong>Duration:</strong> ${context.eventType.duration} minutes</li>
      <li><strong>Location:</strong> ${context.eventType.location}</li>
      ${context.eventType.videoLink ? `<li><strong>Join:</strong> <a href="${context.eventType.videoLink}">${context.eventType.videoLink}</a></li>` : ''}
    </ul>
    
    <h3>💼 What to Expect</h3>
    <p>During our meeting, we'll discuss your needs and how we can help. Feel free to bring any questions you may have!</p>
    
    <p>Need to reschedule? Just reply to this message and we'll help you find a better time.</p>
    
    <p>See you soon! 🙂</p>
  `;
}

/**
 * Fallback host briefing (if AI fails)
 */
function generateFallbackHostBriefing(context: BookingContext): string {
  const dateStr = new Date(context.booking.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: context.booking.timezone,
  });
  const timeStr = new Date(context.booking.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: context.booking.timezone,
  });

  return `
    <h2>Meeting Intelligence Brief 🎯</h2>
    
    <h3>📋 Meeting Overview</h3>
    <ul>
      <li><strong>Event:</strong> ${context.eventType.name}</li>
      <li><strong>Date:</strong> ${dateStr} at ${timeStr}</li>
      <li><strong>Duration:</strong> ${context.eventType.duration} minutes</li>
    </ul>
    
    <h3>👤 Guest Information</h3>
    <ul>
      <li><strong>Name:</strong> ${context.booking.guestName}</li>
      <li><strong>Email:</strong> ${context.booking.guestEmail}</li>
      ${context.booking.guestPhone ? `<li><strong>Phone:</strong> ${context.booking.guestPhone}</li>` : ''}
      <li><strong>Status:</strong> ${(context.previousBookings || 0) > 0 ? `Returning client (${context.previousBookings} previous meetings)` : 'First-time visitor'}</li>
    </ul>
    
    ${context.chatHistory && context.chatHistory.length > 0 ? `
    <h3>💬 Recent Interactions</h3>
    <p>Guest has ${context.chatHistory.length} recent conversation(s) with MindBot. Review these for context.</p>
    ` : ''}
    
    ${context.relevantDocuments && context.relevantDocuments.length > 0 ? `
    <h3>📚 Relevant Resources</h3>
    <ul>
      ${context.relevantDocuments.map(d => `<li>${d.fileName}</li>`).join('')}
    </ul>
    ` : ''}
    
    <h3>🎯 Suggested Talking Points</h3>
    <ul>
      <li>Review guest's background and previous interactions</li>
      <li>Address their main request or concern</li>
      <li>Share relevant resources from knowledge base</li>
    </ul>
    
    <p>Good luck with your meeting! 🚀</p>
  `;
}

/**
 * Main function to generate and save briefings
 */
export async function generateMeetingBriefings(bookingId: string): Promise<{
  success: boolean;
  briefingId?: string;
  error?: string;
}> {
  try {
    // Check if briefing already exists
    const existing = await prisma.meetingBriefing.findFirst({
      where: { bookingId },
    });

    if (existing) {
      return { success: true, briefingId: existing.id };
    }

    // Generate context
    const context = await generateBriefingContext(bookingId);
    if (!context) {
      return { success: false, error: 'Booking not found' };
    }

    // Generate briefings
    const [guestBriefing, hostResult] = await Promise.all([
      generateGuestBriefing(context),
      generateHostBriefing(context),
    ]);

    // Save to database
    const briefing = await prisma.meetingBriefing.create({
      data: {
        bookingId,
        guestBriefing,
        hostBriefing: hostResult.briefing,
        talkingPoints: hostResult.talkingPoints,
        context: {
          hasDocuments: (context.relevantDocuments?.length || 0) > 0,
          hasChatHistory: (context.chatHistory?.length || 0) > 0,
          isReturning: (context.previousBookings || 0) > 0,
          teamSize: context.teamContext?.members?.length || 0,
        },
      },
    });

    return { success: true, briefingId: briefing.id };
  } catch (error) {
    console.error('Error generating meeting briefings:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

