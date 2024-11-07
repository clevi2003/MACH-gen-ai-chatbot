import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { Link, useParams } from "react-router-dom";
import { Header, HelpPanel } from "@cloudscape-design/components";

export default function InterestTest() {
  const { sessionId } = useParams();

  return (    
    <BaseAppLayout
      info={
        <HelpPanel header={<Header variant="h3">Guided Interest Assessment</Header>}>
          <p>
            This is an interactive interest assessment chatbot designed to help you determine what 
            careers or areas of study you might be insterested in. The chatbot will ask you a series 
            of questions to tease out your interests.
          </p>
          <h3>Data Privacy</h3>
          <p>
            This chatbot will redact any personal information you provide. The chat history will not 
            include your name, where you went to school, or any demographic information. This is to 
            protect your data privacy and to ensure that sure guided recommendations for careers or 
            areas of study are as unbiased as possible. Please avoid inputting any personal information.
          </p>
          <h3>Feedback</h3>
          <p>
            You can submit feedback on everything the chatbot outputs. Negative feedback will consist of a category,
            a type of issue, and some written comments. Admin users can view all feedback on a dedicated
            page. Sources (if part of the original response) will be included with the feedback submission.
          </p>
          <h3>Sources</h3>
          <p>
            If the chatbot references any files (uploaded by admin users), they will show up
            underneath the relevant message. Admin users have access to a portal to add or delete
            files. 
          </p>
          <h3>Session history</h3>
          <p>
            All conversations are saved and can be later accessed via {" "}
            <Link to="/chatbot/sessions">Sessions</Link>.
          </p>
        </HelpPanel>
      }
      toolsWidth={300}       
      content={
       <div>
      {/* <Chat sessionId={sessionId} /> */}
      
      <Chat sessionId={sessionId} />
      </div>
     }
    />    
  );
}
