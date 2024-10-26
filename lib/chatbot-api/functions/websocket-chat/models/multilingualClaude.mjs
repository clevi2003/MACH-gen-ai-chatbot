import ClaudeModel from './claude3Sonnet.mjs'
import {
  TranslateClient,
  TranslateTextCommand,
} from '@aws-sdk/client-translate';
import {
  ComprehendClient,
  DetectDominantLanguageCommand,
} from '@aws-sdk/client-comprehend';

export default class MultilingualClaudeModel extends ClaudeModel {
    constructor(){
        super();
        this.translateClient = new TranslateClient({ region: "us-east-1" });
        this.comprehendClient = new ComprehendClient({ region: "us-east-1" });
        this.localizedLanguages = ["en", "es", "pt", "fr", "de", "ja", "it"];
    }

    /** Helper function to detect the language of a text */
    async detectLanguage(text) {
        const detectLanguageParams = { Text: text };
        const detectLanguageCommand = new DetectDominantLanguageCommand(
        detectLanguageParams
        );
        const detectLanguageResponse = await this.comprehendClient.send(
        detectLanguageCommand
        );
        const detectedLanguages = detectLanguageResponse.Languages;
        if (detectedLanguages && detectedLanguages.length > 0) {
        console.log('Detected language:', detectedLanguages[0].LanguageCode);
        return detectedLanguages[0].LanguageCode;
        }
        return 'en'; // Default to English
    }

    /** Helper function to translate text from source language to target language */
    async translateText(text, sourceLanguageCode, targetLanguageCode) {
        if (sourceLanguageCode === targetLanguageCode) {
        return text;
        }
        const translateParams = {
        Text: text,
        SourceLanguageCode: sourceLanguageCode,
        TargetLanguageCode: targetLanguageCode,
        };
        const translateCommand = new TranslateTextCommand(translateParams);
        const translateResponse = await this.translateClient.send(
        translateCommand
        );
        return translateResponse.TranslatedText;
    }

    /** Helper function to ensure chat history is in the given localized language*/
    async cleanHistory(history, targetLanguageCode) {
        let translatedChatHistory = [];
        for (let chatEntry of history) {
            let translatedUser = chatEntry.user;
            let translatedChatbot = chatEntry.chatbot;

            // Detect and translate user message if it exists and if it's not already localized
            if (translatedUser) {
                let userLangCode = await detectLanguage(translatedUser);
                if (!this.localizedLanguages.includes(userLangCode)) {
                    translatedUser = await translateText(translatedUser, userLangCode, targetLanguageCode);
                }
            }

            // Detect and translate chatbot message if it exists and it's not already localized
            if (translatedChatbot) {
                let chatbotLangCode = await detectLanguage(translatedChatbot);
                if (!this.localizedLanguages.includes(chatbotLangCode)) {
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

    /** Override streaming method to support chunked streamed translation*/
    async *getStreamedResponse(system, history, userMessage){
        const currentLanguageCode = await this.detectLanguage(userMessage);
        const needsTranslation = !this.localizedLanguages.includes(currentLanguageCode);
        // clean the history regardless bc past questions might be nonlocalized
        let cleanedHistory = await this.cleanHistory(history, 'en');
        let complete_history;
        // if current message is localized, regular streaming is fine
        if (!needsTranslation) {
            console.log("no translation needed")
            complete_history = super.assembleHistory(cleanedHistory, "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage))
            // clarify in system prompt to respond in the language of the current language code
            let dynamicPrompt = system + " The current language code is " + currentLanguageCode + ". Please respond in this language.";
            // make super stream method convert reponse chunks to string for standardized output type
            const stream = await super.getStreamedResponse(dynamicPrompt, complete_history)
            console.log("stream created")
            try {
                console.log("in the try block")
                // for await (const event of stream) {
                for (const event of stream) {
                    console.log("in the for loop")
                    console.log("event: ", event)
                    const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                    console.log("chunk: ", chunk)
                    const parsedChunk = this.parseChunk(chunk);
                    console.log("parsed chunk before conditional: ", parsedChunk)
                    if (parsedChunk) {
                        console.log("parsed chunk in conditional: ", parsedChunk)
                        // Yield tool use and stop reasons directly to be handled by the caller
                        if (parsedChunk.stop_reason || parsedChunk.type === 'tool_use') {
                            console.log("sending chunk as object")
                            yield parsedChunk;
                            console.log("yielded chunk as object")
                        } else {
                            console.log("sending chunk as string")
                            yield parsedChunk.toString();
                        }
                    }
                }
            } catch (e) {
                console.error("Caught error: streaming error", e);
            }
        } else {
            // if current message is not localized, must translate each chunk separated by \n
            //translate user message to english and build complete history
            let englishUserMessage = await this.translateText(userMessage, currentLanguageCode, 'en');
            complete_history = super.assembleHistory(cleanedHistory, "Please use your search tool one or more times based on this latest prompt: ".concat(englishUserMessage))
            try {
                const stream = super.getStreamedResponse(system, complete_history);
                let chunkBuffer = "";
                for await (const event of stream) {
                    const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                    const parsedChunk = this.parseChunk(chunk);
                    if (parsedChunk) {
                        // Yield tool use and stop reasons directly to be handled by the caller
                        if (parsedChunk.stop_reason || parsedChunk.type === 'tool_use') {
                            // yield the current accumulated chunk and then the tool use or stop reason
                            if (chunkBuffer.trim() != ""){
                                const translatedChunk = await this.translateText(chunkBuffer, 'en', currentLanguageCode);
                                yield translatedChunk;
                                chunkBuffer = "";
                            }
                            chunkBuffer = "";
                            yield parsedChunk;
                        } else {
                            // accumulate chunks until a newline is found
                            chunkBuffer += parsedChunk.toString();
                            if (englishChunkBuffer.includes('\n')) {
                                // split the chunk by newline
                                let [toTranslate, remainder] = englishChunkBuffer.split('\n', 2);
                                englishChunkBuffer = remainder || '';
                                // translate and yield the chunk
                                const translatedChunk = await this.translateText(toTranslate, 'en', currentLanguageCode);
                                yield translatedChunk;
                            }
                        }
                    }
                }
                // handle remaining chunk if it exists
                if (chunkBuffer.trim() != ""){
                    const translatedChunk = await this.translateText(chunkBuffer, 'en', currentLanguageCode);
                    yield translatedChunk;
                }
            } catch (e) {
                console.error("Caught error: streaming translation error", e);
            }
        }

    }
}