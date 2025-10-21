
import { prisma } from '@/lib/db';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface AssignmentContext {
  eventTypeId: string;
  startTime: Date;
  endTime: Date;
  formData?: any;
  routingFormResponses?: Record<string, any>;
}

/**
 * Get Google Calendar availability for a user
 */
async function getGoogleCalendarAvailability(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  try {
    // Get user's Google account
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'google',
      },
    });

    if (!account?.access_token) {
      return false; // No Google Calendar connected
    }

    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    });

    const { calendar } = google;
    const calendarClient = calendar({ version: 'v3', auth: oauth2Client });

    // Check for free/busy
    const response = await calendarClient.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busy = response.data.calendars?.primary?.busy || [];
    return busy.length === 0; // Available if no busy slots
  } catch (error) {
    console.error('Error checking Google Calendar availability:', error);
    return false;
  }
}

/**
 * Get recent booking count for a team member
 */
async function getRecentBookingCount(userId: string, days: number = 7): Promise<number> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const count = await prisma.booking.count({
    where: {
      assignedMemberId: userId,
      createdAt: {
        gte: startDate,
      },
    },
  });

  return count;
}

/**
 * Calculate match score for smart assignment with routing form responses
 */
function calculateMatchScore(
  member: any,
  formData: any,
  routingFormResponses?: Record<string, any>
): number {
  let score = 0;

  // Check skills matching from routing form responses
  if (routingFormResponses) {
    for (const [questionId, answer] of Object.entries(routingFormResponses)) {
      if (!answer) continue;

      const answerText = typeof answer === 'string' ? answer.toLowerCase() : '';
      const answerArray = Array.isArray(answer) ? answer : [];

      // Match against member skills
      if (member.skills?.length > 0) {
        for (const skill of member.skills) {
          const skillLower = skill.toLowerCase();
          // Check if skill matches text answer or is in array answer
          if (answerText.includes(skillLower) || answerArray.includes(skill)) {
            score += 50;
          }
        }
      }

      // Match against member languages
      if (member.languages?.length > 0) {
        for (const lang of member.languages) {
          const langLower = lang.toLowerCase();
          if (answerText.includes(langLower) || answerArray.includes(lang)) {
            score += 40;
          }
        }
      }

      // Keyword matching for text responses
      if (typeof answer === 'string') {
        const keywords = answer.toLowerCase().split(/\s+/);
        for (const keyword of keywords) {
          // Check if any skill or language contains this keyword
          const matchesSkill = member.skills?.some((s: string) => 
            s.toLowerCase().includes(keyword) || keyword.includes(s.toLowerCase())
          );
          const matchesLang = member.languages?.some((l: string) => 
            l.toLowerCase().includes(keyword) || keyword.includes(l.toLowerCase())
          );
          if (matchesSkill) score += 10;
          if (matchesLang) score += 10;
        }
      }
    }
  }

  // Fallback to legacy formData if no routing responses
  if (!routingFormResponses && formData) {
    // Check skills matching
    if (formData?.topic && member.skills?.length > 0) {
      const topicLower = formData.topic.toLowerCase();
      const hasMatchingSkill = member.skills.some((skill: string) =>
        topicLower.includes(skill.toLowerCase())
      );
      if (hasMatchingSkill) score += 50;
    }

    // Check language matching
    if (formData?.message && member.languages?.length > 0) {
      const messageLower = formData.message.toLowerCase();
      for (const lang of member.languages) {
        // Simple language detection
        if (lang.toLowerCase() === 'spanish' && /\b(hola|gracias|por favor|necesito)\b/i.test(messageLower)) {
          score += 30;
        } else if (lang.toLowerCase() === 'german' && /\b(hallo|danke|bitte|ich brauche)\b/i.test(messageLower)) {
          score += 30;
        } else if (lang.toLowerCase() === 'english') {
          score += 10;
        }
      }
    }
  }

  return score;
}

/**
 * Evaluate manual routing rules
 * Returns member ID if a rule matches, null otherwise
 */
function evaluateRoutingRules(
  routingRules: any,
  routingFormResponses?: Record<string, any>
): string | null {
  if (!routingRules?.rules || !routingFormResponses) {
    return null;
  }

  for (const rule of routingRules.rules) {
    const { questionId, operator = 'equals', value, assignTo } = rule;
    const response = routingFormResponses[questionId];

    if (!response || !assignTo) continue;

    let matches = false;

    switch (operator) {
      case 'equals':
        matches = response === value;
        break;
      case 'contains':
        matches = typeof response === 'string' && response.toLowerCase().includes(value.toLowerCase());
        break;
      case 'includes':
        matches = Array.isArray(response) && response.includes(value);
        break;
      default:
        matches = response === value;
    }

    if (matches) {
      return assignTo;
    }
  }

  return null;
}

/**
 * Assign team member using collective mode
 * All members must be available
 */
export async function assignCollective(
  context: AssignmentContext
): Promise<string[] | null> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: context.eventTypeId },
    include: {
      team: {
        include: {
          members: {
            where: { isActive: true },
            include: { user: true },
          },
        },
      },
    },
  });

  if (!eventType?.team) {
    return null;
  }

  // Filter members with Google Calendar sync
  const membersWithCalendar = eventType.team.members.filter(
    (m) => m.user?.calendarSyncEnabled
  );

  if (membersWithCalendar.length === 0) {
    return null;
  }

  // Check availability for all members
  const availabilityChecks = await Promise.all(
    membersWithCalendar.map(async (member) => ({
      memberId: member.user!.id,
      available: await getGoogleCalendarAvailability(
        member.user!.id,
        context.startTime,
        context.endTime
      ),
    }))
  );

  // All members must be available
  const allAvailable = availabilityChecks.every((check) => check.available);

  if (!allAvailable) {
    return null;
  }

  return availabilityChecks.map((check) => check.memberId);
}

/**
 * Assign team member using round-robin mode
 * Fair distribution based on last assignment time
 * With optional routing rules
 */
export async function assignRoundRobin(
  context: AssignmentContext
): Promise<string | null> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: context.eventTypeId },
    include: {
      team: {
        include: {
          members: {
            where: { isActive: true },
            include: { user: true },
            orderBy: { lastAssignedAt: 'asc' }, // Oldest assignment first
          },
        },
      },
    },
  });

  if (!eventType?.team) {
    return null;
  }

  // Check if routing rules exist and should be applied
  if (eventType.enableRouting && eventType.routingRules && context.routingFormResponses) {
    const ruleBasedMember = evaluateRoutingRules(eventType.routingRules, context.routingFormResponses);
    if (ruleBasedMember) {
      // Verify member is in team and available
      const member = eventType.team.members.find(m => m.user?.id === ruleBasedMember);
      if (member?.user?.calendarSyncEnabled) {
        const available = await getGoogleCalendarAvailability(
          member.user.id,
          context.startTime,
          context.endTime
        );
        if (available) {
          await prisma.teamMember.update({
            where: { id: member.id },
            data: { lastAssignedAt: new Date() },
          });
          return member.user.id;
        }
      }
    }
  }

  // Filter members with Google Calendar sync
  const membersWithCalendar = eventType.team.members.filter(
    (m) => m.user?.calendarSyncEnabled
  );

  if (membersWithCalendar.length === 0) {
    return null;
  }

  // Check availability in round-robin order
  for (const member of membersWithCalendar) {
    const available = await getGoogleCalendarAvailability(
      member.user!.id,
      context.startTime,
      context.endTime
    );

    if (available) {
      // Update last assigned time
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { lastAssignedAt: new Date() },
      });

      return member.user!.id;
    }
  }

  return null;
}

/**
 * Assign team member using smart mode
 * AI-based assignment considering availability, workload, skills, and routing form responses
 */
export async function assignSmart(
  context: AssignmentContext
): Promise<string | null> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: context.eventTypeId },
    include: {
      team: {
        include: {
          members: {
            where: { isActive: true },
            include: { user: true },
          },
        },
      },
    },
  });

  if (!eventType?.team) {
    return null;
  }

  // Check if routing rules exist and should be applied (manual rules take precedence)
  if (eventType.enableRouting && eventType.routingRules && context.routingFormResponses) {
    const ruleBasedMember = evaluateRoutingRules(eventType.routingRules, context.routingFormResponses);
    if (ruleBasedMember) {
      // Verify member is in team and available
      const member = eventType.team.members.find(m => m.user?.id === ruleBasedMember);
      if (member?.user?.calendarSyncEnabled) {
        const available = await getGoogleCalendarAvailability(
          member.user.id,
          context.startTime,
          context.endTime
        );
        if (available) {
          await prisma.teamMember.update({
            where: { id: member.id },
            data: { lastAssignedAt: new Date() },
          });
          return member.user.id;
        }
      }
    }
  }

  // Filter members with Google Calendar sync
  const membersWithCalendar = eventType.team.members.filter(
    (m) => m.user?.calendarSyncEnabled
  );

  if (membersWithCalendar.length === 0) {
    return null;
  }

  // Score each member with AI-powered matching
  const memberScores = await Promise.all(
    membersWithCalendar.map(async (member) => {
      // Check availability
      const available = await getGoogleCalendarAvailability(
        member.user!.id,
        context.startTime,
        context.endTime
      );

      if (!available) {
        return null;
      }

      // Calculate score
      let score = 100; // Base score

      // Workload factor (lower workload = higher score)
      const recentBookings = await getRecentBookingCount(member.user!.id);
      score -= recentBookings * 5; // Reduce score based on workload

      // Skills and language matching (enhanced with routing form responses)
      const matchScore = calculateMatchScore(member, context.formData, context.routingFormResponses);
      score += matchScore;

      return {
        memberId: member.user!.id,
        teamMemberId: member.id,
        score,
        member,
      };
    })
  );

  // Filter out unavailable members and sort by score
  const validMembers = memberScores
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.score - a.score);

  if (validMembers.length === 0) {
    return null;
  }

  // Assign to the highest scoring member
  const bestMatch = validMembers[0];

  // Update last assigned time
  await prisma.teamMember.update({
    where: { id: bestMatch.teamMemberId },
    data: { lastAssignedAt: new Date() },
  });

  return bestMatch.memberId;
}

/**
 * Main assignment function that routes to the appropriate strategy
 */
export async function assignTeamMember(
  context: AssignmentContext
): Promise<string | string[] | null> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: context.eventTypeId },
    select: {
      assignmentMode: true,
      teamId: true,
    },
  });

  if (!eventType?.teamId) {
    return null; // Not a team event
  }

  switch (eventType.assignmentMode) {
    case 'collective':
      return await assignCollective(context);
    case 'round_robin':
      return await assignRoundRobin(context);
    case 'smart':
      return await assignSmart(context);
    default:
      return null;
  }
}
