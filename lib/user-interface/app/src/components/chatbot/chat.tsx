import { useContext, useEffect, useState, useRef } from "react";
import {  
  ChatBotHistoryItem,
  ChatBotMessageType,  
  FeedbackData
} from "./types";
import { Auth } from "aws-amplify";
import { SpaceBetween, StatusIndicator, Alert, Flashbar, Button } from "@cloudscape-design/components";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import styles from "../../styles/chat.module.scss";
import { WELCOME_TOPICS, WELCOME_MESSAGE } from "../../common/constants";
import { useNotifications } from "../notif-manager";
import { SessionRefreshContext } from "../../common/session-refresh-context";
import { assembleHistory } from "./utils";
import { ReadyState } from "react-use-websocket";
import { Utils } from "../../common/utils";


export default function Chat(props: { sessionId?: string}) {
  const appContext = useContext(AppContext);
  const [running, setRunning] = useState<boolean>(true);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });  

  const { notifications, addNotification } = useNotifications();

  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>(
    []
  );

  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);

  const { setNeedsRefresh } = useContext(SessionRefreshContext);


  useEffect(() => {
    messageHistoryRef.current = messageHistory;
  }, [messageHistory]);

  /** Loads session history */
  useEffect(() => {
    if (!appContext) return;
    setMessageHistory([]);

    (async () => {
      /** If there is no session ID, then this must be a new session
       * and there is no need to load one from the backend.
       * However, even if a session ID is set and there is no saved session in the 
       * backend, there will be no errors - the API will simply return a blank session
       */
      if (!props.sessionId) {
        setSession({ id: uuidv4(), loading: false });
        return;
      }

      setSession({ id: props.sessionId, loading: true });
      const apiClient = new ApiClient(appContext);
      try {
        // const result = await apiClient.sessions.getSession(props.sessionId);
        let username;
        await Auth.currentAuthenticatedUser().then((value) => username = value.username);
        if (!username) return;
        const hist = await apiClient.sessions.getSession(props.sessionId,username);

        if (hist) {
          
          ChatScrollState.skipNextHistoryUpdate = true;
          ChatScrollState.skipNextScrollEvent = true;
          
          setMessageHistory(
            hist
              .filter((x) => x !== null)
              .map((x) => ({
                type: x!.type as ChatBotMessageType,
                metadata: x!.metadata!,
                content: x!.content,
              }))
          );

          window.scrollTo({
            top: 0,
            behavior: "instant",
          });
        }
        setSession({ id: props.sessionId, loading: false });
        setRunning(false);
      } catch (error) {
        console.log(error);
        addNotification("error",error.message)
        addNotification("info","Please refresh the page")
      }
    })();
  }, [appContext, props.sessionId]);

  /** Adds some metadata to the user's feedback */
  const handleFeedback = (feedbackType: 1 | 0, idx: number, message: ChatBotHistoryItem, feedbackTopic? : string, feedbackProblem? : string, feedbackMessage? : string) => {
    if (props.sessionId) {
      console.log("submitting feedback...")
      
      const prompt = messageHistory[idx - 1].content
      const completion = message.content;
      
      const feedbackData = {
        sessionId: props.sessionId, 
        feedback: feedbackType,
        prompt: prompt,
        completion: completion,
        topic: feedbackTopic,
        problem: feedbackProblem,
        comment: feedbackMessage,
        sources: JSON.stringify(message.metadata.Sources)
      };
      addUserFeedback(feedbackData);
    }
  };

  /** Makes the API call via the ApiClient to submit the feedback */
  const addUserFeedback = async (feedbackData : FeedbackData) => {
    if (!appContext) return;
    const apiClient = new ApiClient(appContext);
    await apiClient.userFeedback.sendUserFeedback(feedbackData);
  }

  const handleSendMessage = async (messageToSend: string) => {
    if (running) return;
  
    let username;
    await Auth.currentAuthenticatedUser().then((value) => (username = value.username));
    if (!username) return;
  
    if (messageToSend.trim().length === 0) {
      addNotification("error", "Please do not submit blank text!");
      return;
    }
  
    try {
      setRunning(true);
      let receivedData = "";
  
      messageHistoryRef.current = [
        ...messageHistoryRef.current,
        {
          type: ChatBotMessageType.Human,
          content: messageToSend,
          metadata: {},
        },
        {
          type: ChatBotMessageType.AI,
          content: receivedData,
          metadata: {},
        },
      ];
      setMessageHistory(messageHistoryRef.current);
  
      let firstTime = messageHistoryRef.current.length < 3;
  
      const TEST_URL = appContext.wsEndpoint + "/";
  
      const TOKEN = await Utils.authenticate();
  
      const wsUrl = TEST_URL + "?Authorization=" + TOKEN;
      const ws = new WebSocket(wsUrl);
  
      let incomingMetadata = false;
      let sources = {};
  
      setTimeout(() => {
        if (receivedData === "") {
          ws.close();
          messageHistoryRef.current.pop();
          messageHistoryRef.current.push({
            type: ChatBotMessageType.AI,
            content: "Response timed out!",
            metadata: {},
          });
          setMessageHistory(messageHistoryRef.current);
        }
      }, 60000);
  
      ws.addEventListener("open", function open() {
        console.log("Connected to the WebSocket server");
        const message = JSON.stringify({
          action: "getChatbotResponse",
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(messageHistoryRef.current.slice(0, -2)),
            systemPrompt: `Your system prompt here`,
            projectId: "rsrs111111",
            user_id: username,
            session_id: session.id,
            retrievalSource: "kb", // Adjust if needed
          },
        });
  
        ws.send(message);
      });
  
      ws.addEventListener("message", async function incoming(data) {
        if (data.data.includes("<!ERROR!>:")) {
          addNotification("error", data.data);
          ws.close();
          return;
        }
        if (data.data === "!<|EOF_STREAM|>!") {
          incomingMetadata = true;
          return;
        }
        if (!incomingMetadata) {
          receivedData += data.data;
        } else {
          let sourceData = JSON.parse(data.data);
          sourceData = sourceData.map((item) => {
            if (item.title === "") {
              return { title: item.uri.slice(item.uri.lastIndexOf("/") + 1), uri: item.uri };
            } else {
              return item;
            }
          });
          sources = { Sources: sourceData };
          console.log(sources);
        }
  
        messageHistoryRef.current = [
          ...messageHistoryRef.current.slice(0, -2),
          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {},
          },
          {
            type: ChatBotMessageType.AI,
            content: receivedData,
            metadata: sources,
          },
        ];
        setMessageHistory(messageHistoryRef.current);
      });
  
      ws.addEventListener("error", function error(err) {
        console.error("WebSocket error:", err);
      });
  
      ws.addEventListener("close", async function close() {
        if (firstTime) {
          Utils.delay(1500).then(() => setNeedsRefresh(true));
        }
        setRunning(false);
        console.log("Disconnected from the WebSocket server");
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Sorry, something has gone wrong! Please try again or refresh the page.");
      setRunning(false);
    }
  };
  

  return (
    <div className={styles.chat_container}> 
      <SpaceBetween direction="vertical" size="m">
        
      {messageHistory.length == 0 && !session?.loading && (
       <Alert
          statusIconAriaLabel="Info"
          header=""
       >
        AI Models can make mistakes. Be mindful in validating important information.
      </Alert> )}

      
        {messageHistory.map((message, idx) => (
          <ChatMessage
            key={idx}
            message={message}            
            onThumbsUp={() => handleFeedback(1,idx, message)}
            onThumbsDown={(feedbackTopic : string, feedbackType : string, feedbackMessage: string) => handleFeedback(0,idx, message,feedbackTopic, feedbackType, feedbackMessage)}                        
          />
        ))}
      </SpaceBetween>
      <div> 
        {messageHistory.length == 0 && !session?.loading && (          
        <>
        {/* Render the welcome content */}
        <div className={styles.welcome_container}>
          {/* Main bubble */}
          <div className={styles.welcome_header_container}>
            <div> 
              {WELCOME_MESSAGE}
            </div>
          </div>
          {/* Lower topic bubbles */}
          {/* <div className={styles.welcome_topics_container}>
            {WELCOME_TOPICS.map((topic, index) => (
              <Button
                key={index}
                className={styles.welcome_topic_button}
                onClick={() => handleSendMessage(topic)}
              >
                {topic}
              </Button>
            ))}
          </div> */}
          <div className={styles.welcome_topics_container}>
            {WELCOME_TOPICS.map((topic, index) => (
              <div
                key={index}
                className={styles.welcome_topic_bubble}
                onClick={() => handleSendMessage(topic)}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSendMessage(topic);
                  }
                }}
              >
                {topic} 
              </div>
            ))}
          </div>
        </div>
      </>
        )}
        {session?.loading && (
          <center>
            <StatusIndicator type="loading">Loading session</StatusIndicator>
          </center>
        )}
      </div>
      <div className={styles.input_container}>
        <ChatInputPanel
          session={session}
          running={running}
          handleSendMessage={handleSendMessage}         
        />
      </div>
    </div>
  );
}
