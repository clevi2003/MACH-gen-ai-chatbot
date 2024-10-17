import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import ClaudeModel from "./models/claude3Sonnet.mjs";
//import ClaudeModel from "./models/claude35Sonnet.mjs"
import Mistral7BModel from "./models/mistral7b.mjs"
import { ComprehendClient, DetectDominantLanguageCommand } from '@aws-sdk/client-comprehend';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';


/*global fetch*/
// setup logging for AWS cloudwatch

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const SYS_PROMPT = process.env.PROMPT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });

// initialize translate client outside handler to reduce latency
const comprehendClient = new ComprehendClient({ region: 'us-east-1' });
const translateClient = new TranslateClient({ region: 'us-east-1' });


/* Use the Bedrock Knowledge Base*/
async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID, languageCode, needsTranslation) {
  if (needsTranslation) {
    // Translate query to English
    query = await translateText(query, languageCode, 'en');
  }

  const input = {
    knowledgeBaseId: knowledgeBaseID,
    retrievalQuery: {
      text: query,
    }
  };
  console.log("Querying knowledge base with: ", query);

  try {
    const command = new KBRetrieveCommand(input);
    const response = await knowledgeBase.send(command);

    const confidenceFilteredResults = response.retrievalResults.filter(item =>
      item.score > 0.5
    );
    let fullContent = confidenceFilteredResults.map(item => item.content.text).join('\n');
    const documentUris = confidenceFilteredResults.map(item => {
      return { title: item.location.s3Location.uri.slice((item.location.s3Location.uri).lastIndexOf("/") + 1) + " (Bedrock Knowledge Base)", uri: item.location.s3Location.uri };
    });

    const flags = new Set();
    const uniqueUris = documentUris.filter(entry => {
      if (flags.has(entry.uri)) {
        return false;
      }
      flags.add(entry.uri);
      return true;
    });

    if (fullContent === '') {
      fullContent = `No knowledge available! This query is likely outside the scope of your knowledge.
      Please provide a general answer but do not attempt to provide specific details.`;
      console.log("Warning: no relevant sources found");
    }

    if (needsTranslation) {
      // Translate fullContent back to user's language
      fullContent = await translateText(fullContent, 'en', languageCode);
    }

    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Caught error: could not retrieve Knowledge Base documents:", error);
    // Return no context
    let fullContent = `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
    Please provide a general answer but do not attempt to provide specific details.`;

    if (needsTranslation) {
      fullContent = await translateText(fullContent, 'en', languageCode);
    }

    return {
      content: fullContent,
      uris: []
    };
  }
};

async function detectLanguage(text) {
  const detectLanguageParams = { Text: text };
  const detectLanguageCommand = new DetectDominantLanguageCommand(detectLanguageParams);
  const detectLanguageResponse = await comprehendClient.send(detectLanguageCommand);
  return detectLanguageResponse.Languages[0].LanguageCode;
};

async function translateText(text, sourceLanguageCode, targetLanguageCode) {
  const translateParams = {
    Text: text,
    SourceLanguageCode: sourceLanguageCode,
    TargetLanguageCode: targetLanguageCode
  };
  const translateCommand = new TranslateTextCommand(translateParams);
  const translateResponse = await translateClient.send(translateCommand);
  return translateResponse.TranslatedText;
};

async function retrieveSessionData(userId, sessionId) {
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

  const response = JSON.parse(result);
  return JSON.parse(response.body);
};

async function saveSessionData(operation, userId, sessionId, newChatEntry, title, languageCode) {
  const sessionSaveRequest = {
    body: JSON.stringify({
      "operation": operation,
      "user_id": userId,
      "session_id": sessionId,
      "new_chat_entry": newChatEntry,
      "title": title,
      "languageCode": languageCode
    })
  };

  const client = new LambdaClient({});
  const lambdaSaveCommand = new InvokeCommand({
    FunctionName: process.env.SESSION_HANDLER,
    Payload: JSON.stringify(sessionSaveRequest),
  });

  await client.send(lambdaSaveCommand);
};

const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;

    let userMessage = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    let chatHistory = data.chatHistory;

    let claude = new ClaudeModel();
    const modelSupportedLanguages = claude.localizedLanguages; // Use the attribute from ClaudeModel

    // Retrieve session data
    let sessionData = {};
    try {
      sessionData = await retrieveSessionData(userId, sessionId);
      console.log('Retrieved session data:', sessionData);
    } catch (error) {
      console.error('Failed to retrieve session data:', error);
      let responseParams = {
        ConnectionId: id,
        Data: '<!ERROR!>: Unable to load past messages, please retry your query'
      };
      const command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
      return;
    }

    // Get chatHistory and languageCode from sessionData
    let retrievedHistory = sessionData.chat_history || [];
    let languageCode = sessionData.languageCode || null;

    // If chatHistory is empty, use the one from the request
    if (retrievedHistory.length === 0) {
      retrievedHistory = chatHistory || [];
    }

    // If languageCode is not present, detect the language
    if (!languageCode) {
      languageCode = await detectLanguage(userMessage);
      console.log(`Detected language: ${languageCode}`);
    }

    const needsTranslation = !modelSupportedLanguages.includes(languageCode);

    let originalUserMessage = userMessage; // Save the original message

    if (needsTranslation) {
      userMessage = await translateText(userMessage, languageCode, 'en');
    }

    // Translate previous user messages to English if needed
    if (needsTranslation && retrievedHistory && retrievedHistory.length > 0) {
      for (let i = 0; i < retrievedHistory.length; i++) {
        const message = retrievedHistory[i];
        if (message.role === 'user') {
          message.content = await translateText(message.content, languageCode, 'en');
        }
      }
    }

    // Proceed with generating the model response
    let lastFiveMessages = retrievedHistory.slice(-2);

    //let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage));

    let modelResponse = '';

    if (needsTranslation) {
      // Collect the full model response -- this internally assembles the history so use last messages instead
      modelResponse = await claude.getResponse(SYS_PROMPT, lastFiveMessages, userMessage);

      // Translate modelResponse back to user's language
      modelResponse = await translateText(modelResponse, 'en', languageCode);

      // Send the translated response to the user
      const responseParams = {
        ConnectionId: id,
        Data: modelResponse
      };
      const command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);

      // Send EOF message
      const eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      };
      const eofCommand = new PostToConnectionCommand(eofParams);
      await wsConnectionClient.send(eofCommand);
    } else {
      let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage));
      // Proceed with your existing streaming logic
      let stopLoop = false;
      let fullDocs = { "content": "", "uris": [] };
      modelResponse = '';

      while (!stopLoop) {
        console.log("started new stream");

        const stream = await claude.getStreamedResponse(SYS_PROMPT, history);
        try {
          let toolInput = "";
          let assemblingInput = false;
          let usingTool = false;
          let toolId;
          let skipChunk = true;
          let message = {};
          let toolUse = {};

          for await (const event of stream) {
            const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            const parsedChunk = await claude.parseChunk(chunk);
            if (parsedChunk) {
              // Handle tool use and streaming logic
              if (parsedChunk.stop_reason) {
                if (parsedChunk.stop_reason == "tool_use") {
                  assemblingInput = false;
                  usingTool = true;
                  skipChunk = true;
                } else {
                  stopLoop = true;
                  break;
                }
              }

              if (parsedChunk.type && parsedChunk.type == "tool_use") {
                assemblingInput = true;
                toolId = parsedChunk.id;
                message['role'] = 'assistant';
                message['content'] = [];
                toolUse['name'] = parsedChunk.name;
                toolUse['type'] = 'tool_use';
                toolUse['id'] = toolId;
                toolUse['input'] = { 'query': "" };
              }

              if (usingTool) {
                console.log("tool input");
                console.log(toolInput);
                let query = JSON.parse(toolInput);

                console.log("using knowledge bases!");
                let knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
                if (!process.env.KB_ID) {
                  throw new Error("Knowledge Base ID is not found.");
                }
                let docString = await retrieveKBDocs(query.query, knowledgeBase, process.env.KB_ID, languageCode, needsTranslation);
                fullDocs.content = fullDocs.content.concat(docString.content);
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

                console.log("correctly used tool!");
              } else {
                if (assemblingInput && !skipChunk) {
                  toolInput = toolInput.concat(parsedChunk);
                } else if (!assemblingInput) {
                  // Send chunk to user
                  let responseParams = {
                    ConnectionId: id,
                    Data: parsedChunk.toString()
                  };
                  modelResponse = modelResponse.concat(parsedChunk.toString());
                  const command = new PostToConnectionCommand(responseParams);
                  try {
                    await wsConnectionClient.send(command);
                  } catch (error) {
                    console.error("Error sending chunk:", error);
                  }
                } else if (skipChunk) {
                  skipChunk = false;
                }
              }
            }
          }
        } catch (error) {
          console.error("Stream processing error:", error);
          let responseParams = {
            ConnectionId: id,
            Data: `<!ERROR!>: ${error}`
          };
          const command = new PostToConnectionCommand(responseParams);
          await wsConnectionClient.send(command);
        }
      }

      // After streaming, send EOF and sources
      let links = JSON.stringify(fullDocs.uris);
      try {
        let eofParams = {
          ConnectionId: id,
          Data: "!<|EOF_STREAM|>!"
        };
        const command = new PostToConnectionCommand(eofParams);
        await wsConnectionClient.send(command);

        // Send sources
        let responseParams = {
          ConnectionId: id,
          Data: links
        };
        const commandLinks = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(commandLinks);
      } catch (e) {
        console.error("Error sending EOF_STREAM and sources:", e);
      }
    }

    // Prepare the new chat entry
    let newChatEntry = {
      "user": originalUserMessage,
      "chatbot": modelResponse,
      "metadata": "" // Ensure 'metadata' is set appropriately
    };

    // Determine operation (add or update session)
    let operation = '';
    let title = '';

    if (sessionData.chat_history === undefined || sessionData.chat_history.length === 0) {
      operation = 'add_session';
      let titleModel = new Mistral7BModel();
      const CONTEXT_COMPLETION_INSTRUCTIONS =
        `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
      [INST]${originalUserMessage}[/INST]
      ${modelResponse} </s>
      Here's your session title:`;
      title = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
      title = title.replaceAll(`"`, '');
    } else {
      operation = 'update_session';
    }

    // Save the session data, including languageCode
    await saveSessionData(operation, userId, sessionId, newChatEntry, title, languageCode);

    // Clean up the WebSocket connection
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
    const command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
  }
};

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
      console.error("Failed to parse JSON:", err)
    }
    console.log(routeKey);

    switch (routeKey) {
      case '$connect':
        console.log('CONNECT')
        return { statusCode: 200 };
      case '$disconnect':
        console.log('DISCONNECT')
        return { statusCode: 200 };
      case '$default':
        console.log('DEFAULT')
        return { 'action': 'Default Response Triggered' }
      case "getChatbotResponse":
        console.log('GET CHATBOT RESPONSE')
        await getUserResponse(connectionId, body)
        return { statusCode: 200 };      
      default:
        return {
          statusCode: 404,  // 'Not Found' status code
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