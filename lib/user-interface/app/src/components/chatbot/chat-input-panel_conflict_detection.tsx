import {
  Button,
  Container,
  Icon,
  Select,
  SelectProps,
  SpaceBetween,
  Spinner,
  StatusIndicator,
} from "@cloudscape-design/components";
import {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { Auth } from "aws-amplify";
import TextareaAutosize from "react-textarea-autosize";
import { ReadyState } from "react-use-websocket";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import styles from "../../styles/chat.module.scss";

import {  
  ChatBotHistoryItem,  
  ChatBotMessageType,
  ChatInputState,  
} from "./types";

import {  
  assembleHistory
} from "./utils";

import { Utils } from "../../common/utils";
import {SessionRefreshContext} from "../../common/session-refresh-context"
import { useNotifications } from "../notif-manager";
 

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}

export interface ChatInputPanelProps {
  running: boolean;
  setRunning: Dispatch<SetStateAction<boolean>>;
  session: { id: string; loading: boolean };
  messageHistory: ChatBotHistoryItem[];
  setMessageHistory: (history: ChatBotHistoryItem[]) => void;
}

export default function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const { transcript, listening, browserSupportsSpeechRecognition } =
    useSpeechRecognition();
  const [state, setState] = useState<ChatInputState>({
    value: '',
  });
  const { addNotification } = useNotifications();
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);

  // State flags for incoming data
  const incomingAssistantDataRef = useRef<boolean>(false);
  const incomingConflictDataRef = useRef<boolean>(false);
  const incomingMetadataRef = useRef<boolean>(false);
  const receivedDataRef = useRef<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    messageHistoryRef.current = props.messageHistory;
  }, [props.messageHistory]);

  /** Speech recognition */
  useEffect(() => {
    if (transcript) {
      setState((state) => ({ ...state, value: transcript }));
    }
  }, [transcript]);

  const cleanMessageHistory = (messageHistory) => {
    return messageHistory.map((message) => {
      if (message.type === ChatBotMessageType.AI) {
        const content = message.content;
        const conflictIndex = content.indexOf('\n\nGenerating Report of Potential Source Conflicts...\n\n');
        if (conflictIndex !== -1) {
          // Remove the conflict report
          return {
            ...message,
            content: content.substring(0, conflictIndex),
          };
        }
      }
      // Return the message as is
      return message;
    });
  };
  
  /**Sends a message to the chat API */
  const handleSendMessage = async () => {
    if (props.running) return;
    props.setRunning(true);

    let username;
    await Auth.currentAuthenticatedUser().then((value) => (username = value.username));
    if (!username) {
      props.setRunning(false);
      return;
    }

    const messageToSend = state.value.trim();
    if (messageToSend.length === 0) {
      addNotification('error', 'Please do not submit blank text!');
      props.setRunning(false);
      return;
    }
    setState({ value: '' });

    try {
      receivedDataRef.current = '';
      // Reset state flags
      incomingAssistantDataRef.current = true;
      incomingConflictDataRef.current = false;
      incomingMetadataRef.current = false;

      /**Add the user's query to the message history and a blank dummy message
       * for the chatbot as the response loads
       */
      messageHistoryRef.current = [
        ...messageHistoryRef.current,

        {
          type: ChatBotMessageType.Human,
          content: messageToSend,
          metadata: {},
        },
        {
          type: ChatBotMessageType.AI,
          content: receivedDataRef.current,
          metadata: {},
        },
      ];
      props.setMessageHistory([...messageHistoryRef.current]);

      const TEST_URL = appContext.wsEndpoint + '/';
      const TOKEN = await Utils.authenticate();
      const wsUrl = TEST_URL + '?Authorization=' + TOKEN;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Event listener for when the connection is open
      ws.addEventListener('open', function open() {
        console.log('Connected to the WebSocket server');
        const message = JSON.stringify({
          action: 'getChatbotResponse',
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(cleanMessageHistory(messageHistoryRef.current.slice(0, -2))),
            systemPrompt: `Your system prompt here...`, // Replace with your actual system prompt
            projectId: 'rsrs111111',
            user_id: username,
            session_id: props.session.id,
          },
        });

        ws.send(message);
      });

      // Event listener for incoming messages
      ws.addEventListener('message', async function incoming(event) {
        const data = event.data;

        // Check for error messages
        if (data.includes('<!ERROR!>:')) {
          addNotification('error', data);
          ws.close();
          props.setRunning(false);
          return;
        }

        // Handle end-of-stream markers
        if (data === '!<|EOF_STREAM|>!') {
          // Assistant's response ended; start receiving conflict detection results
          incomingAssistantDataRef.current = false;
          incomingConflictDataRef.current = true;
          return;
        }

        if (data === '!<|EOF_CONFLICT_STREAM|>!') {
          // Conflict detection results ended; start receiving metadata
          incomingConflictDataRef.current = false;
          incomingMetadataRef.current = true;
          return;
        }

        // Handle incoming data based on the current state
        if (incomingAssistantDataRef.current || incomingConflictDataRef.current) {
          // Append the data to the assistant's response
          receivedDataRef.current += data;

          // Update the last AI message with the combined response
          messageHistoryRef.current[messageHistoryRef.current.length - 1].content =
            receivedDataRef.current;
          props.setMessageHistory([...messageHistoryRef.current]);
        } else if (incomingMetadataRef.current) {
          // Receiving metadata (sources)
          try {
            const sourceData = JSON.parse(data);
            const formattedSources = sourceData.map((item) => {
              return {
                title: item.title || item.uri.slice(item.uri.lastIndexOf('/') + 1),
                uri: item.uri,
              };
            });
            const sources = { Sources: formattedSources };
        
            // Directly access the last AI message
            const aiMessageIndex = messageHistoryRef.current.length - 1;
        
            // Update the assistant's response message with sources
            messageHistoryRef.current[aiMessageIndex].metadata = {
              ...messageHistoryRef.current[aiMessageIndex].metadata,
              ...sources,
            };
            // Update the chat history state with the new messages
            props.setMessageHistory([...messageHistoryRef.current]);
          } catch (err) {
            console.error('Error parsing sources JSON:', err);
          }
        
          // Reset the metadata flag and set running to false
          incomingMetadataRef.current = false;
          props.setRunning(false);
        }
      });

      ws.addEventListener('error', function error(err) {
        console.error('WebSocket error:', err);
        props.setRunning(false);
      });

      ws.addEventListener('close', function close() {
        console.log('Disconnected from the WebSocket server');
        wsRef.current = null;
      });
    } catch (error) {
      console.error('Error sending message:', error);
      alert(
        'Sorry, something has gone horribly wrong! Please try again or refresh the page.'
      );
      props.setRunning(false);
    }
  };

  return (
    <SpaceBetween direction="vertical" size="l">
      <Container>
        <div className={styles.input_textarea_container}>
          <SpaceBetween size="xxs" direction="horizontal" alignItems="center">
            {browserSupportsSpeechRecognition ? (
              <Button
                iconName={listening ? 'microphone-off' : 'microphone'}
                variant="icon"
                ariaLabel="microphone-access"
                onClick={() =>
                  listening
                    ? SpeechRecognition.stopListening()
                    : SpeechRecognition.startListening()
                }
              />
            ) : (
              <Icon name="microphone-off" variant="disabled" />
            )}
          </SpaceBetween>
          <TextareaAutosize
            className={styles.input_textarea}
            maxRows={6}
            minRows={1}
            spellCheck={true}
            autoFocus
            onChange={(e) =>
              setState((state) => ({ ...state, value: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key == 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            value={state.value}
            placeholder={'Send a message'}
          />
          <div style={{ marginLeft: '8px' }}>
            <Button
              disabled={
                props.running || state.value.trim().length === 0 || props.session.loading
              }
              onClick={handleSendMessage}
              iconAlign="right"
              iconName={!props.running ? 'angle-right-double' : undefined}
              variant="primary"
            >
              {props.running ? (
                <>
                  Loading&nbsp;&nbsp;
                  <Spinner />
                </>
              ) : (
                'Send'
              )}
            </Button>
          </div>
        </div>
      </Container>
      <div className={styles.input_controls}>
        <div></div>
        <div className={styles.input_controls_right}>
          <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
            <div style={{ paddingTop: '1px' }}></div>
          </SpaceBetween>
        </div>
      </div>
    </SpaceBetween>
  );
}