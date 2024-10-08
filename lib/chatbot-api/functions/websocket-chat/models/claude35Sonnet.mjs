import {
    BedrockRuntimeClient,
    InvokeModelWithResponseStreamCommand,
    InvokeModelCommand
  } from "@aws-sdk/client-bedrock-runtime";
  
  export default class ClaudeModel {
    constructor() {
      this.client = new BedrockRuntimeClient({
        region: "us-east-1",
      });
      // Update the model ID to Claude 3.5 Sonnet
      this.modelId = "anthropic.claude-3.5-sonnet:0";
    }
  
    assembleHistory(hist, prompt) {
      var history = [];
      hist.forEach((element) => {
        history.push({ "role": "user", "content": [{ "type": "text", "text": element.user }] });
        history.push({ "role": "assistant", "content": [{ "type": "text", "text": element.chatbot }] });
      });
      history.push({ "role": "user", "content": [{ "type": "text", "text": prompt }] });
      return history;
    }
  
    parseChunk(chunk) {
      if (chunk.type == 'content_block_delta') {
        if (chunk.delta.type == 'text_delta') {
          return chunk.delta.text;
        }
        if (chunk.delta.type == "input_json_delta") {
          return chunk.delta.partial_json;
        }
      } else if (chunk.type == "content_block_start") {
        if (chunk.content_block.type == "tool_use") {
          return chunk.content_block;
        }
      } else if (chunk.type == "message_delta") {
        if (chunk.delta.stop_reason == "tool_use") {
          return chunk.delta;
        }
        else {
          return chunk.delta;
        }
      }
    }
  
    async getStreamedResponse(system, history) {
  
      const payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": system,
        "max_tokens": 2048,
        "messages": history,
        "temperature": 0.01,
        "tools": [
          {
            "name": "query_db",
            "description": "Query a vector database for any information in your knowledge base. Try to use specific key words when possible.",
            "input_schema": {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string",
                  "description": "The query you want to make to the vector database."
                }
              },
              "required": [
                "query"
              ]
            }
          }
        ],
      };
  
      try {
        const command = new InvokeModelWithResponseStreamCommand({
          body: JSON.stringify(payload),
          contentType: 'application/json',
          modelId: this.modelId
        });
        const apiResponse = await this.client.send(command);
        console.log('API Response:', apiResponse);
        console.log('API Response Body:', apiResponse.body);
        return apiResponse.body;
      } catch (e) {
        console.error("Caught error: model invoke error", e);
      }
  
    }
  
    async getResponse(system, history, message) {
      const hist = this.assembleHistory(history, message);
      const payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "system": system,
        "max_tokens": 2048,
        "messages": hist,
        "temperature": 0,
        // Include guardrail details if required
        // "amazon-bedrock-guardrailDetails": {
        //    "guardrailId": "your-guardrail-id",
        //    "guardrailVersion": "Version 1"
        //  }
      };
      // Update the model ID to Claude 3.5 Sonnet
      const modelId = "anthropic.claude-3.5-sonnet:0";
      const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId,
      });
      const apiResponse = await this.client.send(command);
      console.log(new TextDecoder().decode(apiResponse.body));
      return JSON.parse(new TextDecoder().decode(apiResponse.body)).content[0].text;
    }
  }
  