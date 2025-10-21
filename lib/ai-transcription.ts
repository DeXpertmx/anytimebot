
/**
 * AI Transcription and Meeting Intelligence
 * Uses LLM API for meeting summaries, action items, and sentiment analysis
 */

interface TranscriptMessage {
  speaker: string;
  text: string;
  timestamp: number;
}

interface MeetingSummary {
  summary: string;
  actionItems: Array<{
    text: string;
    assignee?: string;
    dueDate?: string;
  }>;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

/**
 * Analyze transcript and generate meeting summary with AI
 */
export async function analyzeMeetingTranscript(
  transcript: string,
  participants: string[]
): Promise<MeetingSummary> {
  try {
    const prompt = `Analyze the following meeting transcript and provide:
1. A concise summary (2-3 sentences)
2. Action items with assignees (if mentioned)
3. Key discussion points
4. Overall sentiment (positive/neutral/negative)

Participants: ${participants.join(', ')}

Transcript:
${transcript}

Provide the response in JSON format:
{
  "summary": "...",
  "actionItems": [{"text": "...", "assignee": "...", "dueDate": "..."}],
  "keyPoints": ["...", "..."],
  "sentiment": "positive|neutral|negative"
}`;

    const response = await fetch('https://api.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a meeting analysis assistant. Analyze transcripts and extract insights.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to analyze transcript');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    return {
      summary: 'Unable to generate summary',
      actionItems: [],
      keyPoints: [],
      sentiment: 'neutral',
    };
  }
}

/**
 * Generate live meeting notes during the call
 */
export async function generateLiveNotes(
  recentTranscript: string,
  context: string
): Promise<string> {
  try {
    const prompt = `You are taking live notes during a meeting. Based on the recent conversation, provide a brief update of what's being discussed.

Context: ${context}

Recent conversation:
${recentTranscript}

Provide a 1-2 sentence note about what's currently being discussed.`;

    const response = await fetch('https://api.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a meeting notes assistant. Provide concise, real-time updates.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate live notes');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating live notes:', error);
    return '';
  }
}

/**
 * Detect action items from conversation
 */
export async function detectActionItems(text: string): Promise<string[]> {
  const actionPhrases = [
    "I'll",
    "I will",
    "let me",
    "can you",
    "could you",
    "should we",
    "we need to",
    "we should",
    "action item:",
    "todo:",
    "follow up",
  ];

  const sentences = text.split(/[.!?]+/);
  const actionItems: string[] = [];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (actionPhrases.some(phrase => lowerSentence.includes(phrase))) {
      actionItems.push(sentence.trim());
    }
  }

  return actionItems;
}
