import {
    BreadcrumbGroup,
    ContentLayout,
    Header,
    SpaceBetween,
    Alert,
    Tabs,
    Container
  } from "@cloudscape-design/components";
  import useOnFollow from "../../common/hooks/use-on-follow";
  import BaseAppLayout from "../../components/base-app-layout";
//   import AboutTheToolTab from "./about--tab";
//   import HowToUseTab from "./how-to-use-tab";
//   import SupportTab from "./support-tab";
  import { CHATBOT_NAME } from "../../common/constants";
  import { useState, useEffect, useContext } from "react";
  import { Auth } from "aws-amplify";
  import { ApiClient } from "../../common/api-client/api-client";
  import { AppContext } from "../../common/app-context";
  
  export default function HowToUsePage() {
    const onFollow = useOnFollow();
    const [activeTab, setActiveTab] = useState("file");
    const appContext = useContext(AppContext);

  
 
  
    return (
        <BaseAppLayout
          contentType="cards"
          content={
            <ContentLayout
              header={
                <Header
                  variant="h1"
                >
                  MA Academics To Careers Helper (MATCH) Chatbot
                </Header>
              }
            >
              <SpaceBetween size="l">
                <Container
                  header={
                    <Header
                      variant="h3"
                      // description="Container description"
                    >
                      How To Use The MATCH Chatbot
                    </Header>                
                  }
                >
                  <SpaceBetween size="xxs">
                  Below are general instructions for how to interact with the MATCH Chatbot as well as some tips and tricks to get the most out of the tool.
    
                  <br></br>
          
                  </SpaceBetween>
                </Container>
                <Tabs
                  tabs={[
                      {
                      label: "Prompting Tips",
                      id: "getting-started",
                    //   content: (
                    //       <AboutTheToolTab
                    //       tabChangeFunction={() => setActiveTab("about-the-tool")}
                    //       />
                    //   ),
                      },
                      {
                      label: "Sample Questions",
                      id: "sample-questions",
                    //   content: (
                    //     <HowToUseTab 
                    //       tabChangeFunction={() => setActiveTab("how-to-use")}
                    //     />
                    //   ),
                      },
                  ]}
                  activeTabId={activeTab}
                  onChange={({ detail: { activeTabId } }) => {
                      setActiveTab(activeTabId);
                  }}
                  />
    
              </SpaceBetween>
            </ContentLayout>
          }
        />
      );
    }