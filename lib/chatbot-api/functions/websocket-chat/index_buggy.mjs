import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import ClaudeModel from "./models/claude3Sonnet.mjs";
import MultilingualClaudeModel from './models/multilingualClaude.mjs';
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

/** Function to handle user response */
const getUserResponse = async (id, requestJSON) => {
    try {
      const data = requestJSON.data;
  
      let userMessage = data.userMessage;
      const userId = data.user_id;
      const sessionId = data.session_id;
      let chatHistory = data.chatHistory || [];
  
      // **Initialize the model and knowledge base**
      let claude = new MultilingualClaudeModel();
      const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
      if (!process.env.KB_ID) {
        throw new Error("Knowledge Base ID is not found.");
        }
  
      // **Prepare for streaming response**
      let lastFiveMessages = chatHistory.slice(-2);
      let fullDocs = { "content": "", "uris": [] };
      let modelResponse = '';
      let stopLoop = false;
  
      // **Stream the response**
      while (!stopLoop) {
        console.log("started new stream")
        // console.log(lastFiveMessages)
        // console.log(history)
        lastFiveMessages.forEach((historyItem) => {
          console.log(historyItem)
        })
        const stream = await claude.getStreamedResponse(SYS_PROMPT, lastFiveMessages, userMessage);
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
          // for await (const chunk of stream) {
          for (const chunk of stream) {
            if (chunk) {                      
              
              // this means that we got tool use input or stopped generating text
              if (chunk.stop_reason) {
                if (chunk.stop_reason == "tool_use") {
                  assemblingInput = false;
                  usingTool = true;
                  skipChunk = true;
                } else {
                  stopLoop = true;
                  break;
                }
              }
              
              // this means that we are collecting tool use input
              if (chunk.type) {
               if (chunk.type == "tool_use") {
                 assemblingInput = true;
                 toolId = chunk.id
                 message['role'] = 'assistant'
                 message['content'] = []
                 toolUse['name'] = chunk.name;
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
                lastFiveMessages.push(message)
                
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
                lastFiveMessages.push(toolResponse);
                usingTool = false;
                toolInput = ""
                console.log("correctly used tool!")
              } else {             
                if  (assemblingInput & !skipChunk) {
                  toolInput = toolInput.concat(chunk);
                  // toolUse.input.query += parsedChunk;
                } else if (!assemblingInput) {
                  // console.log('writing out to user')
                  let responseParams = {
                    ConnectionId: id,
                    Data: chunk
                  }
                  modelResponse = modelResponse.concat(chunk)
                  let command = new PostToConnectionCommand(responseParams);
                          
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
          }
          let command = new PostToConnectionCommand(responseParams);
          await wsConnectionClient.send(command);
        }
    
      }
        
  
  
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
  
      let newChatEntry = { "user": userMessage, "chatbot": modelResponse, "metadata": links };
  
      if (retrievedHistory === undefined) {
        operation = 'add_session';
        let titleModel = new Mistral7BModel();
        const CONTEXT_COMPLETION_INSTRUCTIONS =
          `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
  [INST]${translatedUserMessage}[/INST]
  ${modelResponse} </s>
  Here's your session title:`;
        let title = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
        title = englishTitle.replaceAll(`"`, '');
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