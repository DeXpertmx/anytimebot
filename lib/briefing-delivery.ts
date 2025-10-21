
/**
 * Pre-Meeting Intelligence - Delivery
 * Sends briefings via email and WhatsApp
 */

import { prisma } from './db';

interface DeliveryOptions {
  hostEmail: string;
  hostPhone?: string;
  guestEmail: string;
  guestPhone?: string;
  hostBriefing: string;
  guestBriefing: string;
  meetingDetails: {
    type: string;
    time: Date;
    duration: number;
    location: string;
    videoLink?: string;
  };
}

/**
 * Send briefing via email using Resend
 */
export async function sendBriefingEmail(
  to: string,
  subject: string,
  briefing: string,
  meetingDetails: DeliveryOptions['meetingDetails']
): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'ANYTIMEBOT <noreply@anytimebot.app>',
        to,
        subject,
        html: generateBriefingEmailHTML(briefing, meetingDetails),
      }),
    });

    if (!response.ok) {
      console.error('Email send failed:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Get Evolution API credentials from environment variables
 */
async function getEvolutionApiCredentials(): Promise<{
  apiKey: string;
  instanceName: string;
} | null> {
  // Use environment variables
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  if (apiKey && instanceName) {
    return { apiKey, instanceName };
  }

  // If env vars not found, try reading from secrets file at runtime
  try {
    const fs = await import('fs');
    const configPath = process.env.HOME + '/.config/abacusai_auth_secrets.json';
    
    if (fs.existsSync(configPath)) {
      const secrets = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const key = secrets['evolution api']?.secrets?.api_key?.value;
      const instance = secrets['evolution api']?.secrets?.instance_name?.value;
      
      if (key && instance) {
        return { apiKey: key, instanceName: instance };
      }
    }
  } catch (e) {
    // Silent fail - will return null
  }

  return null;
}

/**
 * Send briefing via WhatsApp using Evolution API
 */
export async function sendBriefingWhatsApp(
  phone: string,
  briefing: string,
  meetingDetails: DeliveryOptions['meetingDetails']
): Promise<boolean> {
  try {
    const credentials = await getEvolutionApiCredentials();

    if (!credentials) {
      console.error('Evolution API credentials not found');
      return false;
    }

    const message = formatWhatsAppBriefing(briefing, meetingDetails);

    const response = await fetch(
      `https://evolution-api.com/message/sendText/${credentials.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: credentials.apiKey,
        },
        body: JSON.stringify({
          number: phone,
          text: message,
        }),
      }
    );

    if (!response.ok) {
      console.error('WhatsApp send failed:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    return false;
  }
}

/**
 * Deliver briefings to both host and guest
 */
export async function deliverBriefings(
  options: DeliveryOptions
): Promise<{ emailSuccess: boolean; whatsappSuccess: boolean }> {
  const results = {
    emailSuccess: false,
    whatsappSuccess: false,
  };

  // Send host briefing via email
  const hostEmailSuccess = await sendBriefingEmail(
    options.hostEmail,
    `📋 Pre-Meeting Briefing: ${options.meetingDetails.type}`,
    options.hostBriefing,
    options.meetingDetails
  );

  // Send guest briefing via email
  const guestEmailSuccess = await sendBriefingEmail(
    options.guestEmail,
    `📅 Your Upcoming Meeting: ${options.meetingDetails.type}`,
    options.guestBriefing,
    options.meetingDetails
  );

  results.emailSuccess = hostEmailSuccess && guestEmailSuccess;

  // Send WhatsApp messages if phone numbers available
  if (options.hostPhone) {
    await sendBriefingWhatsApp(
      options.hostPhone,
      options.hostBriefing,
      options.meetingDetails
    );
  }

  if (options.guestPhone) {
    const whatsappSuccess = await sendBriefingWhatsApp(
      options.guestPhone,
      options.guestBriefing,
      options.meetingDetails
    );
    results.whatsappSuccess = whatsappSuccess;
  }

  return results;
}

/**
 * Generate HTML email template
 */
function generateBriefingEmailHTML(
  briefing: string,
  meetingDetails: DeliveryOptions['meetingDetails']
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Meeting Briefing</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">📋 Pre-Meeting Intelligence</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your personalized briefing is ready</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="color: #667eea; margin-top: 0; font-size: 18px;">📅 Meeting Details</h2>
      <p><strong>Type:</strong> ${meetingDetails.type}</p>
      <p><strong>Time:</strong> ${new Date(meetingDetails.time).toLocaleString()}</p>
      <p><strong>Duration:</strong> ${meetingDetails.duration} minutes</p>
      <p><strong>Location:</strong> ${meetingDetails.location}</p>
      ${meetingDetails.videoLink ? `<p><strong>Join Link:</strong> <a href="${meetingDetails.videoLink}" style="color: #667eea;">${meetingDetails.videoLink}</a></p>` : ''}
    </div>
    
    <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="color: #667eea; margin-top: 0; font-size: 18px;">💡 Your Briefing</h2>
      <div style="white-space: pre-wrap;">${briefing}</div>
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border-left: 4px solid #667eea; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #1e40af;">
        <strong>💡 Tip:</strong> This briefing was generated by AI based on your conversation history and uploaded documents. Review it before your meeting for best results.
      </p>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
    <p>Powered by <strong>ANYTIMEBOT</strong> 🤖</p>
    <p>Smart scheduling with AI-powered intelligence</p>
  </div>
</body>
</html>
`;
}

/**
 * Format briefing for WhatsApp
 */
function formatWhatsAppBriefing(
  briefing: string,
  meetingDetails: DeliveryOptions['meetingDetails']
): string {
  return `📋 *PRE-MEETING BRIEFING*

📅 *Meeting Details*
• Type: ${meetingDetails.type}
• Time: ${new Date(meetingDetails.time).toLocaleString()}
• Duration: ${meetingDetails.duration} minutes
• Location: ${meetingDetails.location}
${meetingDetails.videoLink ? `• Join Link: ${meetingDetails.videoLink}` : ''}

💡 *Your Briefing*
${briefing}

---
Powered by ANYTIMEBOT 🤖`;
}
