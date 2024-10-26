import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import ClaudeModel from "./models/claude3Sonnet.mjs";
import Mistral7BModel from "./models/mistral7b.mjs"
import { ComprehendClient, DetectDominantLanguageCommand } from '@aws-sdk/client-comprehend';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';

/*global fetch*/
// Setup logging for AWS CloudWatch

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const SYS_PROMPT = process.env.PROMPT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });

// Initialize translate and comprehend clients outside the handler to reduce latency
const comprehendClient = new ComprehendClient({ region: 'us-east-1' });
const translateClient = new TranslateClient({ region: 'us-east-1' });

/* Use the Bedrock Knowledge Base */
async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID) {
    const input = { // RetrieveRequest
    knowledgeBaseId: knowledgeBaseID, // required
    retrievalQuery: { // KnowledgeBaseQuery
      text: query, // required
    }}
    console.log("Querying knowledge base with: ", query)
  
  
    try {
      const command = new KBRetrieveCommand(input);
      const response = await knowledgeBase.send(command);
      // print all results
      console.log(response.retrievalResults)
  
      // filter the items based on confidence, we do not want LOW confidence results
      const confidenceFilteredResults = response.retrievalResults.filter(item =>
        item.score > 0.5
      )
      // console.log(confidenceFilteredResults)
      let fullContent = confidenceFilteredResults.map(item => item.content.text).join('\n');
      const documentUris = confidenceFilteredResults.map(item => {
        return { title: item.location.s3Location.uri.slice((item.location.s3Location.uri).lastIndexOf("/") + 1) + " (Bedrock Knowledge Base)", uri: item.location.s3Location.uri }
      });
  
      // removes duplicate sources based on URI
      const flags = new Set();
      const uniqueUris = documentUris.filter(entry => {
        if (flags.has(entry.uri)) {
          return false;
        }
        flags.add(entry.uri);
        return true;
      });
  
      // console.log(fullContent);
  
      //Returning both full content and list of document URIs
      if (fullContent == '') {
        fullContent = `No knowledge available! This query is likely outside the scope of your knowledge.
        Please provide a general answer but do not attempt to provide specific details.`
        console.log("Warning: no relevant sources found")
      }
  
      return {
        content: fullContent,
        uris: uniqueUris
      };
    } catch (error) {
      console.error("Caught error: could not retreive Knowledge Base documents:", error);
      // return no context
      return {
        content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
        Please provide a general answer but do not attempt to provide specific details.`,
        uris: []
      };
    }
  }

/** Helper function to detect the language of a text */
async function detectLanguage(text) {
  const detectLanguageParams = { Text: text };
  const detectLanguageCommand = new DetectDominantLanguageCommand(detectLanguageParams);
  const detectLanguageResponse = await comprehendClient.send(detectLanguageCommand);
  const detectedLanguages = detectLanguageResponse.Languages;
  if (detectedLanguages && detectedLanguages.length > 0) {
    console.log("Detected language:", detectedLanguages[0].LanguageCode);
    return detectedLanguages[0].LanguageCode;
  }
  return 'en'; // Default to English
} 

/** Helper function to translate text from source language to target language */
async function translateText(text, sourceLanguageCode, targetLanguageCode) {
  if (sourceLanguageCode === targetLanguageCode) {
    return text;
  }
  const translateParams = {
    Text: text,
    SourceLanguageCode: sourceLanguageCode,
    TargetLanguageCode: targetLanguageCode
  };
  const translateCommand = new TranslateTextCommand(translateParams);
  const translateResponse = await translateClient.send(translateCommand);
  return translateResponse.TranslatedText;
}

/** Helper function to translate chat history to target language */
async function translateChatHistory(chatHistory, targetLanguageCode) {
  let translatedChatHistory = [];
  for (let chatEntry of chatHistory) {
    let translatedUser = chatEntry.user;
    let translatedChatbot = chatEntry.chatbot;

    // Detect and translate user message if it exists
    if (translatedUser) {
      let userLangCode = await detectLanguage(translatedUser);
      translatedUser = await translateText(translatedUser, userLangCode, targetLanguageCode);
    }

    // Detect and translate chatbot message if it exists
    if (translatedChatbot) {
      let chatbotLangCode = await detectLanguage(translatedChatbot);
      translatedChatbot = await translateText(translatedChatbot, chatbotLangCode, targetLanguageCode);
    }

    translatedChatHistory.push({
      user: translatedUser,
      chatbot: translatedChatbot,
      metadata: chatEntry.metadata // Assuming metadata doesn't need translation
    });
  }
  return translatedChatHistory;
}

/** Function to stream response directly without translation */
async function streamResponse(id, stream, llm) {
    const wsClient = wsConnectionClient;
    for await (const event of stream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      const parsedChunk = await llm.parseChunk(chunk);
      if (parsedChunk) {
        let responseParams = {
          ConnectionId: id,
          Data: parsedChunk.toString()
        };
        let command = new PostToConnectionCommand(responseParams);
        try {
          await wsClient.send(command);
        } catch (error) {
          console.error("Error sending chunk:", error);
        }
      }
    }
  }

/** Function to stream response with translation */
async function streamTranslatedResponse(id, stream, userLanguageCode, llm) {
    const wsClient = wsConnectionClient;
    let englishChunkBuffer = '';
    for await (const event of stream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      const parsedChunk = await llm.parseChunk(chunk);
      if (parsedChunk) {
        englishChunkBuffer += parsedChunk.toString();
        if (englishChunkBuffer.includes('\n')) {
          let [toTranslate, remainder] = englishChunkBuffer.split('\n', 2);
          englishChunkBuffer = remainder || '';
          let translatedChunk = await translateText(toTranslate, 'en', userLanguageCode);
          let responseParams = {
            ConnectionId: id,
            Data: translatedChunk
          };
          let command = new PostToConnectionCommand(responseParams);
          try {
            await wsClient.send(command);
          } catch (error) {
            console.error("Error sending translated chunk:", error);
          }
        }
      }
    }
  
    // Translate and send any remaining text
    if (englishChunkBuffer.trim() !== '') {
      let translatedChunk = await translateText(englishChunkBuffer, 'en', userLanguageCode);
      let responseParams = {
        ConnectionId: id,
        Data: translatedChunk
      };
      let command = new PostToConnectionCommand(responseParams);
      try {
        await wsClient.send(command);
      } catch (error) {
        console.error("Error sending final translated chunk:", error);
      }
    }
  }

  export const handler = async (event) => {
    if (event.requestContext) {
      const connectionId = event.requestContext.connectionId;
      const routeKey = event.requestContext.routeKey;
      let body = {};
      try {
        if (event.body) {
          body = JSON.parse(event.body);
        }
      } catch (err) {
        console.error("Failed to parse JSON:", err);
      }
      console.log(routeKey);
  
      switch (routeKey) {
        case '$connect':
          console.log('CONNECT');
          return { statusCode: 200 };
        case '$disconnect':
          console.log('DISCONNECT');
          return { statusCode: 200 };
        case '$default':
          console.log('DEFAULT');
          return { 'action': 'Default Response Triggered' };
        case "getChatbotResponse":
          console.log('GET CHATBOT RESPONSE');
          await getUserResponse(connectionId, body);
          return { statusCode: 200 };
        default:
          return {
            statusCode: 404,
            body: JSON.stringify({
              error: "The requested route is not recognized."
            })
          };
      }
    }
    return {
      statusCode: 200,
    };
  };

/** Function to stream response with optional translation */
async function streamResponseWithOptionalTranslation(id, claude, history, translationNeeded, userLanguageCode, fullDocs) {
    const wsClient = wsConnectionClient;
    let englishChunkBuffer = '';
    let modelResponse = '';
    
    let stopLoop = false;
  
    while (!stopLoop) {
      console.log("Started new stream");
  
      // Get the model stream
      const stream = await claude.getStreamedResponse(SYS_PROMPT, history);
  
      // setup for tool use logic
      let toolInput = "";
      let assemblingInput = false;
      let usingTool = false;
      let toolId;
      let skipChunk = true;
      let message = {};
      let toolUse = {};
  
      // Iterate through each chunk from the model stream
      try {
        for await (const event of stream) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          const parsedChunk = await claude.parseChunk(chunk);
          if (parsedChunk) {
            // Handle tool use and other logic
            if (parsedChunk.stop_reason) {
              if (parsedChunk.stop_reason === "tool_use") {
                assemblingInput = false;
                usingTool = true;
                skipChunk = true;
                break; // Break to handle tool use outside the loop
              } else {
                stopLoop = true;
                break;
              }
            }
  
            if (parsedChunk.type) {
              if (parsedChunk.type === "tool_use") {
                assemblingInput = true;
                toolId = parsedChunk.id;
                message['role'] = 'assistant';
                message['content'] = [];
                toolUse['name'] = parsedChunk.name;
                toolUse['type'] = 'tool_use';
                toolUse['id'] = toolId;
                toolUse['input'] = { 'query': "" };
              }
            }
  
            if (usingTool) {
              // Tool use handling will occur outside the loop
              break;
            } else {
              if (assemblingInput && !skipChunk) {
                toolInput += parsedChunk;
              } else if (!assemblingInput) {
                // Here is where we handle sending the chunk to the user, possibly translating it
                let outputChunk = parsedChunk.toString();
                modelResponse += outputChunk;
                if (translationNeeded) {
                  englishChunkBuffer += outputChunk;
                  // Check if there is a '\n' in the buffer
                  while (englishChunkBuffer.includes('\n')) {
                    let newlineIndex = englishChunkBuffer.indexOf('\n');
                    let toTranslate = englishChunkBuffer.slice(0, newlineIndex + 1); // Include the '\n'
                    englishChunkBuffer = englishChunkBuffer.slice(newlineIndex + 1);
                    let translatedChunk = await translateText(toTranslate, 'en', userLanguageCode);
                    let responseParams = {
                      ConnectionId: id,
                      Data: translatedChunk
                    };
                    let command = new PostToConnectionCommand(responseParams);
                    try {
                      await wsClient.send(command);
                    } catch (error) {
                      console.error("Error sending translated chunk:", error);
                    }
                  }
                } else {
                  // Send the chunk directly
                  let responseParams = {
                    ConnectionId: id,
                    Data: outputChunk
                  };
                  let command = new PostToConnectionCommand(responseParams);
                  try {
                    await wsClient.send(command);
                  } catch (error) {
                    console.error("Error sending chunk:", error);
                  }
                }
              } else if (skipChunk) {
                skipChunk = false;
              }
            }
          }
        }
  
        // Handle tool use outside the loop if usingTool is true
        if (usingTool) {
          console.log("Tool input:", toolInput);
          let query = JSON.parse(toolInput);
          let docString = await retrieveKBDocs(query.query, new BedrockAgentRuntimeClient({ region: 'us-east-1' }), process.env.KB_ID);
          fullDocs.content += docString.content;
          fullDocs.uris = fullDocs.uris.concat(docString.uris);
  
          // Add the model's query to the tool use message
          toolUse.input.query = query.query;
          // Add the tool use message to chat history
          message.content.push(toolUse);
          history.push(message);
  
          // Add the tool response to chat history
          let toolResponse = {
            "role": "user",
            "content": [
              {
                "type": "tool_result",
                "tool_use_id": toolId,
                "content": docString.content
              }
            ]
          };
  
          history.push(toolResponse);
          usingTool = false;
          toolInput = "";
          console.log("Correctly used tool!");
          // Restart the stream with updated history
          continue;
        }
  
      } catch (error) {
        console.error("Stream processing error:", error);
        let responseParams = {
          ConnectionId: id,
          Data: `<!ERROR!>: ${error}`
        };
        let command = new PostToConnectionCommand(responseParams);
        await wsClient.send(command);
        return;
      }
    }
  
    // After the loop, if translation is needed, send any remaining buffered text
    if (translationNeeded && englishChunkBuffer.trim() !== '') {
      let translatedChunk = await translateText(englishChunkBuffer, 'en', userLanguageCode);
      let responseParams = {
        ConnectionId: id,
        Data: translatedChunk
      };
      let command = new PostToConnectionCommand(responseParams);
      try {
        await wsClient.send(command);
      } catch (error) {
        console.error("Error sending final translated chunk:", error);
      }
    }
  
    return modelResponse;
  }

/** Function to handle user response */
const getUserResponse = async (id, requestJSON) => {
    try {
      const data = requestJSON.data;
  
      let userMessage = data.userMessage;
      const userId = data.user_id;
      const sessionId = data.session_id;
      let chatHistory = data.chatHistory || [];
  
      // **Detect user's language**
      let userLanguageCode = await detectLanguage(userMessage);
  
      // **Initialize the model**
      let claude = new ClaudeModel();
      const localizedLanguages = claude.localizedLanguages;
  
      // **Determine if translation is needed**
      let translationNeeded = !localizedLanguages.includes(userLanguageCode);
  
      // **Translate userMessage and chatHistory to English if needed**
      let translatedUserMessage = userMessage;
      let processedChatHistory = chatHistory;
      if (translationNeeded) {
        translatedUserMessage = await translateText(userMessage, userLanguageCode, 'en');
        processedChatHistory = await translateChatHistory(chatHistory, 'en');
      }
  
      // **Prepare for streaming response**
      let lastFiveMessages = processedChatHistory.slice(-2);
      let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(translatedUserMessage));
      let fullDocs = { "content": "", "uris": [] };
  
      // **Stream the response with optional translation**
      const modelResponse = await streamResponseWithOptionalTranslation(id, claude, history, translationNeeded, userLanguageCode, fullDocs);
  
  
      // **Send EOF and sources as before**
      let command;
      let links = JSON.stringify(fullDocs.uris);
      try {
        let eofParams = {
          ConnectionId: id,
          Data: "!<|EOF_STREAM|>!"
        };
        command = new PostToConnectionCommand(eofParams);
        await wsConnectionClient.send(command);
  
        // Send sources
        let responseParams = {
          ConnectionId: id,
          Data: links
        };
        command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
      } catch (e) {
        console.error("Error sending EOF_STREAM and sources:", e);
      }
  
      // **Retrieve session data**
      const sessionRequest = {
        body: JSON.stringify({
          "operation": "get_session",
          "user_id": userId,
          "session_id": sessionId
        })
      };
      const client = new LambdaClient({});
      const lambdaCommand = new InvokeCommand({
        FunctionName: process.env.SESSION_HANDLER,
        Payload: JSON.stringify(sessionRequest),
      });
  
      const { Payload } = await client.send(lambdaCommand);
      const result = Buffer.from(Payload).toString();
  
      if (!result) {
        throw new Error(`Error retrieving session data!`);
      }
  
      // Parse the JSON
      let output = {};
      try {
        const response = JSON.parse(result);
        output = JSON.parse(response.body);
        console.log('Parsed JSON:', output);
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        let responseParams = {
          ConnectionId: id,
          Data: '<!ERROR!>: Unable to load past messages, please retry your query'
        };
        command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
        return;
      }
  
      const retrievedHistory = output.chat_history;
      let operation = '';
      let title = '';
  
      // **Prepare new chat entry with messages in user's language**
      let finalModelResponse = modelResponse;
      if (translationNeeded) {
        finalModelResponse = await translateText(modelResponse, 'en', userLanguageCode);
      }
      let newChatEntry = { "user": userMessage, "chatbot": finalModelResponse, "metadata": links };
  
      if (retrievedHistory === undefined) {
        operation = 'add_session';
        let titleModel = new Mistral7BModel();
        const CONTEXT_COMPLETION_INSTRUCTIONS =
          `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
  [INST]${translatedUserMessage}[/INST]
  ${modelResponse} </s>
  Here's your session title:`;
        let englishTitle = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
        englishTitle = englishTitle.replaceAll(`"`, '');
  
        // **Translate the title if needed**
        if (translationNeeded) {
          title = await translateText(englishTitle, 'en', userLanguageCode);
        } else {
          title = englishTitle;
        }
      } else {
        operation = 'update_session';
      }
  
      // **Save session with messages in user's language**
      const sessionSaveRequest = {
        body: JSON.stringify({
          "operation": operation,
          "user_id": userId,
          "session_id": sessionId,
          "new_chat_entry": newChatEntry,
          "title": title
        })
      };
  
      const lambdaSaveCommand = new InvokeCommand({
        FunctionName: process.env.SESSION_HANDLER,
        Payload: JSON.stringify(sessionSaveRequest),
      });
  
      await client.send(lambdaSaveCommand);
  
      // **Clean up connection**
      const input = {
        ConnectionId: id,
      };
      await wsConnectionClient.send(new DeleteConnectionCommand(input));
  
    } catch (error) {
      console.error("Error:", error);
      let responseParams = {
        ConnectionId: id,
        Data: `<!ERROR!>: ${error}`
      };
      let command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
    }
  };