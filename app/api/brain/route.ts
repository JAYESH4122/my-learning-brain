import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { generateSummary, generateWithWebSearch } from "@/lib/gemini";
import { embedText } from "@/lib/embeddings";

interface MemoryMatch {
  body: string;
  title?: string;
  id?: string;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  try {
    const { inputText, userId } = await req.json();

    if (!inputText || !userId) {
      return NextResponse.json(
        { error: "inputText and userId are required" },
        { status: 400 }
      );
    }

    // Step 1: Check for special "Do I know about X" pattern
    const trimmedInput = inputText.trim().toLowerCase();
    const isKnowledgeCheck = /^(do i know|do you know|do i know about|do you know about|have i learned|have i learned about)/i.test(trimmedInput);
    
    // Step 2: Use AI to classify if input is a question or a statement/info to store
    const classificationPrompt = `Analyze the following user input and determine if it is:
1. A QUESTION - The user is asking something, seeking information, or wants to know about something
2. A STATEMENT - The user is providing information, stating facts, or sharing knowledge to be stored

Examples of QUESTIONS:
- "what's my name"
- "color of the sea"
- "what is photosynthesis"
- "tell me about dogs"
- "how does this work"

Examples of STATEMENTS:
- "my name is John"
- "the color of the sea is blue"
- "I learned that photosynthesis converts light to energy"
- "dogs are loyal animals"

User input: "${inputText}"

Respond with ONLY one word: "question" or "statement".`;

    let isQuestion = false;
    try {
      const classification = (await generateSummary(classificationPrompt))
        .trim()
        .toLowerCase();
      
      isQuestion = classification.includes("question");
      console.log(`AI Classification: ${classification} -> isQuestion: ${isQuestion}`);
    } catch (classificationError) {
      console.error("Error classifying input:", classificationError);
      // Fallback to simple check if AI classification fails
      isQuestion = trimmedInput.endsWith('?') || 
                   /^(what|who|when|where|why|how|which|can|could|would|should|is|are|do|does|did|will|tell me|explain|describe|show me)/i.test(trimmedInput);
    }

    // Filter out very short responses that are likely not information to store
    const isVeryShort = trimmedInput.length < 3 || /^(no|yes|ok|okay|sure|nope|yep)$/i.test(trimmedInput);
    
    // If it's very short and not a question, don't treat it as information to store
    if (isVeryShort && !isQuestion) {
      return NextResponse.json({
        type: "note",
        response: "I understand. How can I help you?",
        message: "Acknowledged",
      });
    }

    // Step 2: Always search existing memories first to find relevant context
    let userMatches: MemoryMatch[] = [];
    
    try {
      const queryEmbedding = await embedText(inputText);
      
      const { data: matches, error: matchError } = await supabase.rpc(
        "match_memories",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.5, // Lower threshold to catch more relevant memories (was 0.6)
          match_count: 10, // Get more matches for better context
        }
      );

      if (matchError) {
        console.error("Error matching memories:", matchError);
      }

      // Filter matches by user_id if RPC doesn't handle it
      // Note: Ideally, the match_memories RPC should filter by user_id at the database level
      // If user_id is present in matches, filter by it. If not, assume RPC already filtered.
      userMatches = matches?.filter((m: MemoryMatch & { user_id?: string }) => {
        // If user_id field exists in the match, filter by it
        if ('user_id' in m) {
          return m.user_id === userId;
        }
        // If user_id doesn't exist, assume RPC already filtered (include the match)
        return true;
      }) || [];
      
      console.log(`Vector search found ${matches?.length || 0} matches, ${userMatches.length} after user filtering`);
    } catch (embedError) {
      console.error("Error creating embedding:", embedError);
    }

    // Fallback: If no vector matches found and it's a question, query all user memories
    // This helps with cases where vector similarity is low but the information exists
    if ((!userMatches || userMatches.length === 0) && isQuestion) {
      console.log("No vector matches found for question, using fallback to query all user memories");
      try {
        const { data: allMemories, error: queryError } = await supabase
          .from("memories")
          .select("id, title, body, user_id, memory_type, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30); // Get more recent memories

        if (!queryError && allMemories && allMemories.length > 0) {
          // Use all memories as context for questions when vector search fails
          // Sort by most recent first
          userMatches = allMemories.sort((a: MemoryMatch & { created_at?: string }, b: MemoryMatch & { created_at?: string }) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
          }) as MemoryMatch[];
          console.log(`Fallback: Using ${userMatches.length} user memories for question`);
        }
      } catch (fallbackError) {
        console.error("Error in fallback memory query:", fallbackError);
      }
    }

    // Step 3: Handle special "Do I know about X" questions
    if (isKnowledgeCheck && isQuestion) {
      // Extract the topic from "Do I know about RAG" -> "RAG"
      const topicMatch = inputText.match(/(?:do i know|do you know|do i know about|do you know about|have i learned|have i learned about)\s+(?:about\s+)?(.+)/i);
      const topic = topicMatch ? topicMatch[1].trim() : inputText.replace(/^(do i know|do you know|do i know about|do you know about|have i learned|have i learned about)\s+(?:about\s+)?/i, '').trim();
      
      // First, ensure we have all user memories for better search
      if (!userMatches || userMatches.length === 0) {
        try {
          const { data: allMemories } = await supabase
            .from("memories")
            .select("id, title, body, user_id, memory_type, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50);
          
          if (allMemories && allMemories.length > 0) {
            userMatches = allMemories as MemoryMatch[];
          }
        } catch (err) {
          console.error("Error fetching all memories for knowledge check:", err);
        }
      }
      
      // Search for knowledge about this topic in stored memories
      const topicLower = topic.toLowerCase();
      let knowledgeFound = false;
      let relatedMemories: MemoryMatch[] = [];
      let directKnowledge: MemoryMatch | null = null;
      
      if (userMatches && userMatches.length > 0) {
        // Check for direct knowledge and related topics
        relatedMemories = userMatches.filter((m: MemoryMatch) => {
          const body = (m.body || "").toLowerCase();
          const title = (m.title || "").toLowerCase();
          
          // Direct match
          if (body.includes(topicLower) || 
              body.includes(`i know about ${topicLower}`) ||
              body.includes(`i know ${topicLower}`) ||
              title.includes(topicLower)) {
            directKnowledge = m;
            return true;
          }
          
          // Related topics (partial matches)
          const words = topicLower.split(/\s+/);
          return words.some((word: string) => word.length > 3 && (body.includes(word) || title.includes(word)));
        });
        
        knowledgeFound = directKnowledge !== null || relatedMemories.length > 0;
      }
      
      if (knowledgeFound) {
        // User knows about this topic - create contextual response
        const context = relatedMemories.map((m: MemoryMatch) => m.body).join("\n\n");
        
        const responsePrompt = `You are helping a user check what they know. Based on their stored memories, respond to their question about whether they know about "${topic}".

User's stored knowledge from their database:
${context}

Question: ${inputText}

INSTRUCTIONS:
- Respond as if you're checking THEIR knowledge base, not your own
- Confirm what they know about ${topic} from their stored memories
- Be conversational and personal
- If they have related knowledge (e.g., they know about RAG and asking about AI), mention those connections naturally
- Reference their previous learning if relevant
- Keep it brief, friendly, and natural
- Write in second person ("you know...") not first person ("I know...")
- Focus on what THEY have learned and stored, not general AI knowledge

Respond naturally:`;

        const personalizedResponse = await generateSummary(responsePrompt);
        
        return NextResponse.json({
          type: "question",
          response: personalizedResponse,
          answer: personalizedResponse,
          known: true,
        });
      } else {
        // User doesn't know about this topic - search and learn
        console.log(`Knowledge check: User doesn't know about ${topic}, searching and learning`);
        const webAnswer = await generateWithWebSearch(`What is ${topic}? Explain comprehensively in a clear, structured way.`);
        
        // Store as "I know about X" statement, not Q&A
        const knowledgeStatement = `I know about ${topic}. ${webAnswer}`;
        const embedding = await embedText(knowledgeStatement);
        
        const title = `I know about ${topic}`;
        
        const { data: newMemory, error: newMemoryError } = await supabase
          .from("memories")
          .insert([
            {
              user_id: userId,
              title: title.length > 60 ? title.slice(0, 57) + "..." : title,
              body: knowledgeStatement,
              memory_type: "note",
              source: "gemini",
            },
          ])
          .select()
          .single();
        
        if (!newMemoryError && newMemory) {
          await supabase.from("memory_vectors").insert([
            { memory_id: newMemory.id, embedding }
          ]);
        }
        
        return NextResponse.json({
          type: "question",
          response: `No, you don't know about ${topic} yet. Let me search for information about it...\n\n${webAnswer}`,
          answer: `No, you don't know about ${topic} yet. Let me search for information about it...\n\n${webAnswer}`,
          known: false,
          learned: true,
        });
      }
    }

    // Step 4: Process based on classification
    // IMPORTANT: Questions are ALWAYS answered, never treated as statements
      if (isQuestion) {
        // It's a question - always answer it
        if (userMatches && userMatches.length > 0) {
          // Sort matches by relevance - prioritize exact matches and more specific info
          // For questions about personal info, look for the most specific/recent entry
          const sortedMatches = [...userMatches].sort((a, b) => {
            const aBody = (a.body || "").toLowerCase();
            const bBody = (b.body || "").toLowerCase();
            const questionLower = inputText.toLowerCase();
            
            // Prioritize exact matches in the body
            if (aBody.includes(questionLower) && !bBody.includes(questionLower)) return -1;
            if (!aBody.includes(questionLower) && bBody.includes(questionLower)) return 1;
            
            // Prioritize shorter, more specific entries (likely more direct answers)
            if (aBody.length < bBody.length) return -1;
            if (aBody.length > bBody.length) return 1;
            
            return 0;
          });
          
          // We have stored memories - use them to answer
          const context = sortedMatches.map((m: MemoryMatch) => m.body).join("\n\n");
          
          const answerPrompt = `You are a helpful assistant with access to the user's personal knowledge base. Answer the question naturally and conversationally based on their stored memories.

The user's stored knowledge:
${context}

Question: ${inputText}

INSTRUCTIONS:
- Answer based ONLY on the user's stored memories above
- Be conversational and natural, like talking to a friend
- Reference their stored information naturally
- If they have related knowledge, you can mention it
- Extract the EXACT information that answers the question
- If multiple answers exist, use the MOST RECENT or MOST SPECIFIC one
- For personal info (name, password), extract the EXACT value
- If the stored information does NOT contain the answer, respond with exactly: "NOT_IN_STORED_INFO"
- Write as if you're recalling what they know, not what you know as an AI

Answer naturally and conversationally:`;

          const answer = await generateSummary(answerPrompt);
          
          // Check if the answer indicates the info wasn't in stored data
          const answerLower = answer.toLowerCase().trim();
          if (answerLower.includes("not_in_stored_info") || 
              answerLower.includes("don't have") || 
              answerLower.includes("don't have that information") ||
              answerLower.includes("i don't have") ||
              (answerLower.length < 20 && answerLower.includes("don't"))) {
            // The stored info doesn't answer the question - use web search
            console.log("Stored memories don't answer the question, using web search");
            const webAnswer = await generateWithWebSearch(inputText);
            
            // Extract topic from question for better storage
            // For questions like "what is RAG", store as "I know about RAG"
            let knowledgeStatement = webAnswer;
            const whatIsMatch = inputText.match(/what (?:is|are) (.+)/i);
            if (whatIsMatch) {
              const topic = whatIsMatch[1].trim();
              knowledgeStatement = `I know about ${topic}. ${webAnswer}`;
            } else {
              // Store as Q&A for other types of questions
              knowledgeStatement = `Q: ${inputText}\nA: ${webAnswer}`;
            }
            
            const embedding = await embedText(knowledgeStatement);
            
            const title = inputText.length > 60 
              ? inputText.slice(0, 57) + "..." 
              : inputText;
            
            const { data: newMemory, error: newMemoryError } = await supabase
              .from("memories")
              .insert([
                {
                  user_id: userId,
                  title: title,
                  body: knowledgeStatement,
                  memory_type: "question",
                  source: "gemini",
                },
              ])
              .select()
              .single();
            
            if (!newMemoryError && newMemory) {
              await supabase.from("memory_vectors").insert([
                { memory_id: newMemory.id, embedding }
              ]);
            }
            
            return NextResponse.json({
              type: "question",
              response: webAnswer,
              answer: webAnswer,
              known: false,
              learned: true,
            });
          }

          return NextResponse.json({
            type: "question",
            response: answer,
            answer: answer, // For backward compatibility
            known: true,
            relatedCount: userMatches.length,
          });
        } else {
          // Question but no stored memories - will be handled in Step 4
          // Continue to Step 4 to generate answer and store it
        }
    } else if (userMatches && userMatches.length > 0) {
      // It's a statement and we have matches - check for duplicates
      const context = userMatches.map((m: MemoryMatch) => m.body).join("\n\n");
        // User is providing new info
        // Only check similarity if we have a reasonable number of matches (likely relevant)
        // For statements, if matches exist, they might be similar - but we should still store
        // unless it's EXACTLY the same information
        
        // Check if the exact same text already exists
        const exactMatch = userMatches.find((m: MemoryMatch) => 
          m.body.toLowerCase().trim() === inputText.toLowerCase().trim()
        );

        if (exactMatch) {
          return NextResponse.json({
            type: "note",
            response: "I already have this exact information stored. Is there anything else you'd like to add or clarify?",
            message: "Information already exists",
          });
        }

        // For similar but not exact matches, do a quick similarity check
        // But only if we have a small number of highly relevant matches
        if (userMatches.length <= 3) {
          const similarityCheckPrompt = `Compare these two pieces of information. Are they essentially the SAME information (not just related, but the same fact)?

Existing stored information:
${context}

New information provided:
${inputText}

Respond with ONLY "same" if they contain the exact same information/fact, or "different" if the new information is different or adds new details. Be strict - only say "same" if it's truly the same information.`;

          const similarity = (await generateSummary(similarityCheckPrompt))
            .trim()
            .toLowerCase();

          if (similarity.includes("same") && !similarity.includes("different")) {
            return NextResponse.json({
              type: "note",
              response: "I already have this information stored. Is there anything else you'd like to add or clarify?",
              message: "Information already exists",
            });
          }
        }

        // Store the new information (original text, not summarized)
        const embedding = await embedText(inputText);
        
        const title = inputText.length > 60 
          ? inputText.slice(0, 57) + "..." 
          : inputText;

        const { data: memory, error: memoryError } = await supabase
          .from("memories")
          .insert([
            {
              user_id: userId,
              title: title,
              body: inputText, // Store original text, not summary
              memory_type: "note",
              source: "user",
            },
          ])
          .select()
          .single();

        if (memoryError) throw memoryError;

        const { error: vectorError } = await supabase
          .from("memory_vectors")
          .insert([{ memory_id: memory.id, embedding }]);

        if (vectorError) throw vectorError;

        return NextResponse.json({
          type: "note",
          response: "Got it! I've saved this information. I can recall it when you ask related questions.",
          message: "Memory saved!",
        });
    }

    // Step 4: Handle questions without matches or statements without matches
    if (isQuestion) {
      // Question with no stored context - use web search to find answer
      console.log("No stored memories found, using web search to answer question");
      
      // Use web search to get current information
      const answer = await generateWithWebSearch(inputText);
      
      // Extract topic from question for better storage
      // For questions like "what is RAG", store as "I know about RAG"
      let knowledgeStatement = answer;
      const whatIsMatch = inputText.match(/what (?:is|are) (.+)/i);
      if (whatIsMatch) {
        const topic = whatIsMatch[1].trim();
        knowledgeStatement = `I know about ${topic}. ${answer}`;
      } else {
        // Store as Q&A for other types of questions
        knowledgeStatement = `Q: ${inputText}\nA: ${answer}`;
      }
      
      const embedding = await embedText(knowledgeStatement);

      const title = inputText.length > 60 
        ? inputText.slice(0, 57) + "..." 
        : inputText;

      const { data: newMemory, error: newMemoryError } = await supabase
        .from("memories")
        .insert([
            {
              user_id: userId,
              title: title,
              body: knowledgeStatement, // Store as knowledge statement or Q&A
              memory_type: "question",
              source: "gemini",
            },
        ])
        .select()
        .single();

      if (newMemoryError) throw newMemoryError;

      const { error: vectorError } = await supabase
        .from("memory_vectors")
        .insert([{ memory_id: newMemory.id, embedding }]);

      if (vectorError) throw vectorError;

      return NextResponse.json({
        type: "question",
        response: answer,
        answer: answer, // For backward compatibility
        known: false,
        learned: true,
      });
    } else {
      // Statement/info with no stored context - store it directly
      const embedding = await embedText(inputText);
      
      const title = inputText.length > 60 
        ? inputText.slice(0, 57) + "..." 
        : inputText;

      const { data: memory, error: memoryError } = await supabase
        .from("memories")
        .insert([
          {
            user_id: userId,
            title: title,
            body: inputText, // Store original text exactly as provided
            memory_type: "note",
            source: "user",
          },
        ])
        .select()
        .single();

      if (memoryError) throw memoryError;

      const { error: vectorError } = await supabase
        .from("memory_vectors")
        .insert([{ memory_id: memory.id, embedding }]);

      if (vectorError) throw vectorError;

      return NextResponse.json({
        type: "note",
        response: "Perfect! I've saved this information. I'll remember it and can reference it when you ask related questions.",
        message: "Memory saved!",
      });
    }
  } catch (err: unknown) {
    console.error("Error processing memory:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
