
/**
 * RAG (Retrieval Augmented Generation) utilities
 * For retrieving relevant context from host's uploaded documents
 */

import { prisma } from './db';
import { generateEmbedding, cosineSimilarity } from './llm';

/**
 * Search for relevant documents using RAG
 */
export async function searchRelevantDocuments(
  botId: string,
  query: string,
  topK = 5
): Promise<Array<{ content: string; fileName: string; similarity: number }>> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Fetch all documents for this bot
    const allDocuments = await prisma.botDocument.findMany({
      where: {
        botId,
      },
      select: {
        id: true,
        fileName: true,
        content: true,
        embedding: true,
      },
    });

    // Filter documents with embeddings
    const documents = allDocuments.filter((doc) => doc.embedding !== null);

    // Calculate similarity scores
    const results = documents
      .map((doc) => {
        const docEmbedding = doc.embedding as number[];
        const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
        return {
          content: doc.content,
          fileName: doc.fileName,
          similarity,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  } catch (error) {
    console.error('Error searching documents:', error);
    return [];
  }
}

/**
 * Build context from relevant documents
 */
export async function buildDocumentContext(
  botId: string,
  query: string,
  maxLength = 3000
): Promise<string> {
  const relevantDocs = await searchRelevantDocuments(botId, query);

  if (relevantDocs.length === 0) {
    return '';
  }

  let context = 'Relevant information from uploaded documents:\n\n';
  let currentLength = context.length;

  for (const doc of relevantDocs) {
    const docText = `From "${doc.fileName}" (relevance: ${(doc.similarity * 100).toFixed(1)}%):\n${doc.content}\n\n`;
    
    if (currentLength + docText.length > maxLength) {
      break;
    }

    context += docText;
    currentLength += docText.length;
  }

  return context;
}
