
// Utility functions for working with document search and RAG

/**
 * Simple text similarity using keyword matching
 * Returns a score between 0 and 1 based on how many keywords match
 */
function calculateTextSimilarity(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const contentLower = content.toLowerCase();
  
  if (queryWords.length === 0) return 0;
  
  let matches = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }
  
  return matches / queryWords.length;
}

/**
 * Find most relevant documents using text search
 */
export function findSimilarDocuments(
  query: string,
  documents: Array<{ id: string; content: string; fileName: string }>,
  topK: number = 3
): Array<{ id: string; content: string; fileName: string; similarity: number }> {
  const results = documents.map((doc) => ({
    ...doc,
    similarity: calculateTextSimilarity(query, doc.content),
  }));

  // Sort by similarity (highest first)
  results.sort((a, b) => b.similarity - a.similarity);

  // Return top K results
  return results.slice(0, topK);
}

/**
 * Generate a simple placeholder for embedding field
 * Since we're not using embeddings anymore, we just return empty array
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Return empty array as placeholder - we're using text search instead
  return [];
}
