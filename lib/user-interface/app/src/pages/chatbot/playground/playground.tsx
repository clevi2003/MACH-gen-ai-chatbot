import BaseAppLayout from "../../../components/base-app-layout";
import Chat from "../../../components/chatbot/chat";

import { Link, useParams } from "react-router-dom";
import { Header, HelpPanel } from "@cloudscape-design/components";

export default function Playground() {
  const { sessionId } = useParams();

  return (    
    <BaseAppLayout
      info={
        <HelpPanel header={<Header variant="h3">Using MATCH</Header>}>
          <p>
          MATCH can help you explore courses and programs at Massachusetts public colleges, 
          offer personalized career guidance, mapping, and support—all in the language you're most comfortable using.
          Created in partnership with AI4Impact and the Executive Office of Education.
          </p>
          <h3>How to use</h3>
          <p>
          MATCH is super simple to use! Just type in your questions or explore programs and career 
          paths based on what interests you. Need a little guidance? <Link to="/chatbot/tips">Click here for prompting tips 
          and sample questions to help you get started.</Link>
          </p>
          <h3>Multilingual support</h3>
          <p>
          MATCH makes it easy for everyone to use, no matter what language they speak. With built-in 
          multilingual support, it helps students and parents explore programs, 
          map out career paths, and find opportunities in the language they’re most comfortable with. <Link to="/chatbot/languages">Click here to view a list of all the languages MATCH supports.</Link>
          </p>
          <h3>Feedback</h3>
          <p>
          You can submit feedback on any response by selecting a category, describing the issue, and 
          adding comments (for negative feedback). Your input is essential for improving MATCH's 
          accuracy and performance!
          </p>
          <h3>Data sources</h3>
          <p>
          MATCH combines trusted sources like Massachusetts public colleges and career databases 
          <a style={{padding: "0px 4px"}} href="https://www.bls.gov/" target="_blank" rel="noopener noreferrer">
            Bureau of Labor Statistics
          </a>
          and
          <a style={{padding: "0px 4px"}} href="https://www.onetonline.org/" target="_blank" rel="noopener noreferrer">
          O*NET 
          </a> 
          to provide accurate, up-to-date advice for planning your education and career.
          </p>
          <h3>Support</h3>
          <p>
          Need help or have questions? We're here for you – to contact support and get the assistance you need, 
          reach out to [contact/email address].
          </p>
        </HelpPanel>
      }
      toolsWidth={300}       
      content={
       <div>      
        <Chat sessionId={sessionId} />
      </div>
     }
    />    
  );
}
