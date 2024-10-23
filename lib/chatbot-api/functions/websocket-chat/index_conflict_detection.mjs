import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
    DeleteConnectionCommand,
  } from '@aws-sdk/client-apigatewaymanagementapi';
  import {
    BedrockAgentRuntimeClient,
    RetrieveCommand as KBRetrieveCommand,
  } from '@aws-sdk/client-bedrock-agent-runtime';
  import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
  import ClaudeModel from './models/claude3Sonnet.mjs';
  // import Mistral7BModel from "./models/mistral7b.mjs"
  import {
    ComprehendClient,
    DetectDominantLanguageCommand,
  } from '@aws-sdk/client-comprehend';
  import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
  
  /*global fetch*/
  // setup logging for AWS cloudwatch
  
  const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
  const SYS_PROMPT = process.env.PROMPT;
  const CONFL_PROMPT = process.env.CONFL_PROMPT;
  const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });
  
  // Initialize clients outside the handler to improve performance
  const comprehendClient = new ComprehendClient({ region: 'us-east-1' });
  const translateClient = new TranslateClient({ region: 'us-east-1' });
  
  /* Function to retrieve documents from the Knowledge Base */
  async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID) {
    const input = {
      knowledgeBaseId: knowledgeBaseID,
      retrievalQuery: {
        text: query,
      },
    };
    console.log('Querying knowledge base with:', query);
  
    try {
      const command = new KBRetrieveCommand(input);
      const response = await knowledgeBase.send(command);
      console.log(response.retrievalResults);
  
      // Filter items based on confidence score
      const confidenceFilteredResults = response.retrievalResults.filter(
        (item) => item.score > 0.5
      );
  
      // Prepare documents array
      const documents = confidenceFilteredResults.map((item) => {
        return {
          content: item.content.text,
          uri: item.location.s3Location.uri,
          title:
            item.location.s3Location.uri.slice(
              item.location.s3Location.uri.lastIndexOf('/') + 1
            ) + ' (Bedrock Knowledge Base)',
        };
      });
  
      // Remove duplicate sources based on URI
      const flags = new Set();
      const uniqueDocuments = documents.filter((entry) => {
        if (flags.has(entry.uri)) {
          return false;
        }
        flags.add(entry.uri);
        return true;
      });
  
      if (uniqueDocuments.length === 0) {
        console.log('Warning: no relevant sources found');
        uniqueDocuments.push({
          content: `No knowledge available! This query is likely outside the scope of your knowledge.
          Please provide a general answer but do not attempt to provide specific details.`,
          uri: '',
          title: '',
        });
      }
  
      return {
        documents: uniqueDocuments,
      };
    } catch (error) {
      console.error('Caught error: could not retrieve Knowledge Base documents:', error);
      // Return no context
      return {
        documents: [
          {
            content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
          Please provide a general answer but do not attempt to provide specific details.`,
            uri: '',
            title: '',
          },
        ],
      };
    }
  }
  
  /* Function to generate conflict report */
  async function detectConflicts(documents, conflictCallback) {
    // Prepare the prompt for conflict detection
    let prompt = `The following are documents retrieved from a knowledge base for a user's query.\n\n`;
    documents.forEach((doc, index) => {
      prompt += `Document ${index + 1} (${doc.title}):\n${doc.content}\n\n`;
    });
    prompt += CONFL_PROMPT;
  
    // Use the model to generate the conflict report
    let conflictModel = new ClaudeModel();
    // Get the streamed response
    const stream = await conflictModel.getNoContextStreamedResponse(prompt);
  
    // Stream the response to the user via the conflictCallback
    try {
      for await (const event of stream) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        const parsedChunk = conflictModel.parseChunk(chunk);
        if (parsedChunk && typeof parsedChunk === 'string') {
          await conflictCallback(parsedChunk);
        }
      }
    } catch (error) {
      console.error('Conflict detection stream error:', error);
      // Optionally, send an error message via the conflictCallback
      await conflictCallback(`<!ERROR in conflict detection!>: ${error}`);
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
        throw new Error('Knowledge Base ID is not found.');
      }
  
      // Initialize Claude model and prepare history
      let claude = new ClaudeModel();
      let lastMessages = chatHistory.slice(-2);
  
      let stopLoop = false;
      let modelResponse = '';
  
      let history = claude.assembleHistory(
        lastMessages,
        'Please use your search tool one or more times based on this latest prompt: '.concat(
          userMessage
        )
      );
      let fullDocs = []; // Collect all documents for conflict detection
  
      while (!stopLoop) {
        console.log('started new stream');
        history.forEach((historyItem) => {
          console.log(historyItem);
        });
        const stream = await claude.getStreamedResponse(SYS_PROMPT, history);
        try {
          let toolInput = '';
          let assemblingInput = false;
          let usingTool = false;
          let toolId;
          let skipChunk = true;
          let message = {};
          let toolUse = {};
  
          // Iterate through each chunk from the model stream
          for await (const event of stream) {
            const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            const parsedChunk = await claude.parseChunk(chunk);
            if (parsedChunk) {
              if (parsedChunk.stop_reason) {
                if (parsedChunk.stop_reason == 'tool_use') {
                  assemblingInput = false;
                  usingTool = true;
                  skipChunk = true;
                } else {
                  stopLoop = true;
                  break;
                }
              }
  
              if (parsedChunk.type) {
                if (parsedChunk.type == 'tool_use') {
                  assemblingInput = true;
                  toolId = parsedChunk.id;
                  message['role'] = 'assistant';
                  message['content'] = [];
                  toolUse['name'] = parsedChunk.name;
                  toolUse['type'] = 'tool_use';
                  toolUse['id'] = toolId;
                  toolUse['input'] = { query: '' };
                }
              }
  
              if (usingTool) {
                // Get context from knowledge base
                console.log('tool input');
                console.log(toolInput);
                let query = JSON.parse(toolInput);
  
                console.log('using knowledge bases!');
                let docResult = await retrieveKBDocs(
                  query.query,
                  knowledgeBase,
                  process.env.KB_ID
                );
                // Collect the documents
                fullDocs = fullDocs.concat(docResult.documents);
  
                // Add the model's query to the tool use message
                toolUse.input.query = query.query;
                // Add the tool use message to chat history
                message.content.push(toolUse);
                history.push(message);
  
                // Add the tool response to chat history
                let toolResponse = {
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: toolId,
                      content: docResult.documents.map((doc) => doc.content).join('\n'),
                    },
                  ],
                };
  
                history.push(toolResponse);
  
                usingTool = false;
                toolInput = '';
  
                console.log('correctly used tool!');
              } else {
                if (assemblingInput && !skipChunk) {
                  toolInput = toolInput.concat(parsedChunk);
                } else if (!assemblingInput) {
                  if (typeof parsedChunk === 'string') {
                    let responseParams = {
                      ConnectionId: id,
                      Data: parsedChunk,
                    };
                    modelResponse = modelResponse.concat(parsedChunk);
                    let command = new PostToConnectionCommand(responseParams);
  
                    try {
                      await wsConnectionClient.send(command);
                    } catch (error) {
                      console.error('Error sending chunk:', error);
                    }
                  }
                } else if (skipChunk) {
                  skipChunk = false;
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          let responseParams = {
            ConnectionId: id,
            Data: `<!ERROR!>: ${error}`,
          };
          let command = new PostToConnectionCommand(responseParams);
          await wsConnectionClient.send(command);
        }
      }
  
      let command;
      // Prepare the sources as an array and a JSON string
      let sourcesArray = fullDocs.map((doc) => ({ title: doc.title, uri: doc.uri }));
      let sourcesJson = JSON.stringify(sourcesArray);
  
      // Send end of assistant response stream
      try {
        // Send end of main response marker
        let eofParams = {
          ConnectionId: id,
          Data: '!<|EOF_STREAM|>!',
        };
        command = new PostToConnectionCommand(eofParams);
        await wsConnectionClient.send(command);
  
        // Send conflict detection notice
        let conflictNotice = '\n\nGenerating Report of Potential Source Conflicts...\n\n';
        let responseParams = {
          ConnectionId: id,
          Data: conflictNotice,
        };
        command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
  
        // Include the conflict notice in modelResponse
        modelResponse = modelResponse.concat(conflictNotice);
  
        // Start conflict detection
        await detectConflicts(fullDocs, async (conflictChunk) => {
          if (typeof conflictChunk === 'string') {
            let responseParams = {
              ConnectionId: id,
              Data: conflictChunk,
            };
            modelResponse = modelResponse.concat(conflictChunk);
            let command = new PostToConnectionCommand(responseParams);
            await wsConnectionClient.send(command);
          }
        });
  
        // Send end of conflict report marker
        let eofConflictParams = {
          ConnectionId: id,
          Data: '!<|EOF_CONFLICT_STREAM|>!',
        };
        command = new PostToConnectionCommand(eofConflictParams);
        await wsConnectionClient.send(command);
  
        // Send sources
        console.log('Sending sources:', sourcesJson);
        let sourcesParams = {
          ConnectionId: id,
          Data: sourcesJson,
        };
        command = new PostToConnectionCommand(sourcesParams);
        await wsConnectionClient.send(command);
      } catch (e) {
        console.error('Error sending conflict detection results:', e);
      }
  
      // Handle sessions
      const sessionRequest = {
        body: JSON.stringify({
          operation: 'get_session',
          user_id: userId,
          session_id: sessionId,
        }),
      };
      const client = new LambdaClient({});
      const lambdaCommand = new InvokeCommand({
        FunctionName: process.env.SESSION_HANDLER,
        Payload: JSON.stringify(sessionRequest),
      });
  
      const { Payload } = await client.send(lambdaCommand);
      const result = Buffer.from(Payload).toString();
  
      // Check if the request was successful
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
          Data: '<!ERROR!>: Unable to load past messages, please retry your query',
        };
        command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
        return; // Optional: Stop further execution in case of JSON parsing errors
      }
  
      // Continue processing the data
      const retrievedHistory = output.chat_history;
      let operation = '';
      let title = '';
  
      let newChatEntry = {
        user: userMessage,
        chatbot: modelResponse,
        //metadata: sourcesArray, // Save the sources as an array
        metadata: sourcesJson, // Save the sources as a JSON string
      };
      if (retrievedHistory === undefined) {
        operation = 'add_session';
        let titleModel = new ClaudeModel();
        const CONTEXT_COMPLETION_INSTRUCTIONS = `Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.
  [User]: ${userMessage}
  [Assistant]: ${modelResponse}
  Here's your session title:`;
        title = await titleModel.getResponse('', [], CONTEXT_COMPLETION_INSTRUCTIONS);
        title = title.replaceAll(`"`, '');
      } else {
        operation = 'update_session';
      }
  
      const sessionSaveRequest = {
        body: JSON.stringify({
          operation: operation,
          user_id: userId,
          session_id: sessionId,
          new_chat_entry: newChatEntry,
          title: title,
          languageCode: 'en', // Replace with actual language code if needed
        }),
      };
  
      const lambdaSaveCommand = new InvokeCommand({
        FunctionName: process.env.SESSION_HANDLER,
        Payload: JSON.stringify(sessionSaveRequest),
      });
  
      await client.send(lambdaSaveCommand);
  
      const input = {
        ConnectionId: id,
      };
      await wsConnectionClient.send(new DeleteConnectionCommand(input));
    } catch (error) {
      console.error('Error:', error);
      let responseParams = {
        ConnectionId: id,
        Data: `<!ERROR!>: ${error}`,
      };
      let command = new PostToConnectionCommand(responseParams);
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
        console.error('Failed to parse JSON:', err);
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
          return { action: 'Default Response Triggered' };
        case 'getChatbotResponse':
          console.log('GET CHATBOT RESPONSE');
          await getUserResponse(connectionId, body);
          return { statusCode: 200 };
        default:
          return {
            statusCode: 404, // 'Not Found' status code
            body: JSON.stringify({
              error: 'The requested route is not recognized.',
            }),
          };
      }
    }
    return {
      statusCode: 200,
    };
  };
   