import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import ClaudeModel from "./models/claude3Sonnet.mjs";
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

//function to send data via websocket
async function sendToConnection(connectionId, data) {
    const wsClient = wsConnectionClient;
    const params = {
        ConnectionId: connectionId,
        Data: data,
    };
    try {
        await wsClient.send(new PostToConnectionCommand(params));
    } catch (error) {
        console.error("Error sending message:", error);
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
async function translateChatHistory(chatHistory, targetLanguageCode, localizedLanguages) {
    let translatedChatHistory = [];
    for (let chatEntry of chatHistory) {
      let translatedUser = chatEntry.user;
      let translatedChatbot = chatEntry.chatbot;
  
      // Detect and translate user message if it exists
      if (translatedUser) {
        let userLangCode = await detectLanguage(translatedUser);
        if (!localizedLanguages.includes(userLangCode)) {
            translatedUser = await translateText(translatedUser, userLangCode, targetLanguageCode);
        }
      }
  
      // Detect and translate chatbot message if it exists
      if (translatedChatbot) {
        let chatbotLangCode = await detectLanguage(translatedChatbot);
        if (!localizedLanguages.includes(chatbotLangCode)) {
            translatedChatbot = await translateText(translatedChatbot, chatbotLangCode, targetLanguageCode);
        }
    }
  
      translatedChatHistory.push({
        user: translatedUser,
        chatbot: translatedChatbot,
        metadata: chatEntry.metadata // Assuming metadata doesn't need translation
      });
    }
    return translatedChatHistory;
  }  

/* Use the Bedrock Knowledge Base*/
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

async function getSystemPrompt() {
  try{
    const client = new LambdaClient({});
    const command = new InvokeCommand({
      FunctionName: process.env.SYSTEM_PROMPTS_HANDLER,
      Payload: JSON.stringify({ "operation": "get_active_prompt" }),
    });
    const response = await client.send(command);
    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    //check response status code
    if (response.StatusCode !== 200) {
      throw new Error("Failed to get system prompt: " + payload.body);
    }
    return payload.body;
  } catch (error) {
    console.error("Caught error: could not retreive system prompt:", error);
    //return process.env.PROMPT;
  }
}

const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;    

    let userMessage = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    const chatHistory = data.chatHistory;    
    
    const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

    if (!process.env.KB_ID) {
      throw new Error("Knowledge Base ID is not found.");
    }  
    const SYS_PROMPT = await getSystemPrompt();      

    // retrieve a model response based on the last 5 messages
    // messages come paired, so that's why the slice is only 2 (2 x 2 + the latest prompt = 5)
    let claude = new ClaudeModel();
    let lastFiveMessages = await translateChatHistory(chatHistory.slice(-2), 'en', claude.localizedLanguages);
    
    let stopLoop = false;        
    let localizedModelResponse = ''
    let translatedModelResponse = ''
    let englishChunkBuffer = '';
    let langSpecificUserMessage = userMessage;

    const userLangCode = await detectLanguage(userMessage);
    // const localizedTranslation = claude.localizedLanguages.includes(userLangCode) && userLangCode !== 'en';
    const needsTranslation = !claude.localizedLanguages.includes(userLangCode);
    if (needsTranslation) {
        userMessage = await translateText(userMessage, userLangCode, 'en');
    } else if (userLangCode !== 'en'){
        // add to the end of the user message to respond in the given language code
        langSpecificUserMessage = langSpecificUserMessage.concat(`Please respond in [${userLangCode}]'`);
    }
    console.log("User message:", userMessage);
    console.log("lastFiveMessages:", lastFiveMessages);
    console.log("last messages type:", typeof lastFiveMessages);
    let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(langSpecificUserMessage))    
    let fullDocs = {"content" : "", "uris" : []}
    
    while (!stopLoop) {
      console.log("started new stream")
      // console.log(lastFiveMessages)
      // console.log(history)
      history.forEach((historyItem) => {
        console.log(historyItem)
      })
      const stream = await claude.getStreamedResponse(SYS_PROMPT, history);
      try {
        // store the full model response for saving to sessions later
        
        let toolInput = "";
        let assemblingInput = false
        let usingTool = false;
        let toolId;
        let skipChunk = true;
        // this is for when the assistant uses a tool
        let message = {};
        // this goes in that message
        let toolUse = {}
        
        // iterate through each chunk from the model stream
        for await (const event of stream) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          const parsedChunk = await claude.parseChunk(chunk);
          if (parsedChunk) {                      
            
            // this means that we got tool use input or stopped generating text
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
            
            // this means that we are collecting tool use input
            if (parsedChunk.type) {
             if (parsedChunk.type == "tool_use") {
               assemblingInput = true;
               toolId = parsedChunk.id
               message['role'] = 'assistant'
               message['content'] = []
               toolUse['name'] = parsedChunk.name;
               toolUse['type'] = 'tool_use'
               toolUse['id'] = toolId;
               toolUse['input'] = {'query' : ""}
             } 
            }
            
            
            if (usingTool) {
              
              // get the full block of context from knowledge base
              let docString;
              console.log("tool input")
              console.log(toolInput);
              let query = JSON.parse(toolInput);
              
              console.log("using knowledge bases!")
              docString = await retrieveKBDocs(query.query, knowledgeBase, process.env.KB_ID);
              fullDocs.content = fullDocs.content.concat(docString.content)
              fullDocs.uris = fullDocs.uris.concat(docString.uris)              
              
              // add the model's query to the tool use message
              toolUse.input.query = query.query;
              // add the tool use message to chat history
              message.content.push(toolUse)
              history.push(message)
              
              // add the tool response to chat history
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
              toolInput = ""
              
              console.log("correctly used tool!")
              
            } else {             
            
              if  (assemblingInput && !skipChunk) {
                toolInput = toolInput.concat(parsedChunk);
                // toolUse.input.query += parsedChunk;
              } else if (!assemblingInput) {
                // build model response
                localizedModelResponse = localizedModelResponse.concat(parsedChunk)
                // console.log('writing out to user')
                if (needsTranslation) {
                    englishChunkBuffer = englishChunkBuffer.concat(parsedChunk.toString());
                    while (englishChunkBuffer.includes('\n')) {
                        let newlineIndex = englishChunkBuffer.indexOf('\n');
                        let toTranslate = englishChunkBuffer.slice(0, newlineIndex + 1); // Include the '\n'
                        englishChunkBuffer = englishChunkBuffer.slice(newlineIndex + 1);
                        let translatedChunk = await translateText(toTranslate, 'en', userLangCode);
                        await sendToConnection(id, translatedChunk);
                        translatedModelResponse = translatedModelResponse.concat(translatedChunk);
                      }
                } else {
                    await sendToConnection(id, parsedChunk.toString());
                    translatedModelResponse = translatedModelResponse.concat(parsedChunk);
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
        }
        let command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
      }
  
    }

    // After the loop, if translation is needed, send any remaining buffered text
    if (needsTranslation && englishChunkBuffer.trim() !== '') {
        let translatedChunk = await translateText(englishChunkBuffer, 'en', userLangCode);
        await sendToConnection(id, translatedChunk);
        translatedModelResponse = translatedModelResponse.concat(translatedChunk);
      }

    let command;
    let links = JSON.stringify(fullDocs.uris)
    // send end of stream message
    try {
      let eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      }
      command = new PostToConnectionCommand(eofParams);
      await wsConnectionClient.send(command);

      // send sources
      let responseParams = {
        ConnectionId: id,
        Data: links
      }
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
    } catch (e) {
      console.error("Error sending EOF_STREAM and sources:", e);
    }


    const sessionRequest = {
      body: JSON.stringify({
        "operation": "get_session",
        "user_id": userId,
        "session_id": sessionId
      })
    }
    const client = new LambdaClient({});
    const lambdaCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionRequest),
    });

    const { Payload, LogResult } = await client.send(lambdaCommand);
    const result = Buffer.from(Payload).toString();

    // Check if the request was successful
    if (!result) {
      throw new Error(`Error retriving session data!`);
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
      }
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
      return; // Optional: Stop further execution in case of JSON parsing errors
    }

    // Continue processing the data
    const retrievedHistory = output.chat_history;
    let operation = '';
    let title = ''; // Ensure 'title' is initialized if used later in your code

    // Further logic goes here

    let newChatEntry = { "user": userMessage, "chatbot": translatedModelResponse, "metadata": links };
    if (retrievedHistory === undefined) {
      operation = 'add_session';
      let titleModel = new Mistral7BModel();
      const CONTEXT_COMPLETION_INSTRUCTIONS =
        `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
      [INST]${userMessage}[/INST]
      ${localizedModelResponse} </s>
      Here's your session title:`;
      title = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
      title = title.replaceAll(`"`, '');
      if (needsTranslation) {
        title = await translateText(title, 'en', userLangCode);
      }
    } else {
      operation = 'update_session';
    }

    const sessionSaveRequest = {
      body: JSON.stringify({
        "operation": operation,
        "user_id": userId,
        "session_id": sessionId,
        "new_chat_entry": newChatEntry,
        "title": title,
        //"languageCode": languageCode
      })
    }

    const lambdaSaveCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionSaveRequest),
    });

    // const { SessionSavePayload, SessionSaveLogResult } = 
    await client.send(lambdaSaveCommand);

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
    let responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${error}`
    }
    let command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
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