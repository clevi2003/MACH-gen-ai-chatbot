import {
    BreadcrumbGroup,
    ContentLayout,
    Header,
    SpaceBetween,
    Alert,
    Tabs,
    Container
  } from "@cloudscape-design/components";
  import useOnFollow from "../../../common/hooks/use-on-follow";
  import BaseAppLayout from "../../../components/base-app-layout";
  import SetPromptTab from "./set-prompt-tab";
  import NewPromptTab from "./new-prompt-tab";
//   import PromptEvalTab from "./prompt-eval-tab";
  import { CHATBOT_NAME } from "../../../common/constants";
  import { useState, useEffect, useContext } from "react";
  import { Auth } from "aws-amplify";
  //import { AppContext } from "../../../common/app-context";
  
  export default function ConfigurationPage() {
    const onFollow = useOnFollow();
    const [admin, setAdmin] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState("current-eval");
    //const appContext = useContext(AppContext);
  
  
    /** Checks for admin status */
    useEffect(() => {
      (async () => {
        try {
          const result = await Auth.currentAuthenticatedUser();
          if (!result || Object.keys(result).length === 0) {
            console.log("Signed out!")
            Auth.signOut();
            return;
          }
          const admin = result?.signInUserSession?.idToken?.payload["custom:role"]
          if (admin) {
            const data = JSON.parse(admin);
            if (data.includes("Admin")) {
              setAdmin(true);
            }
          }
        }
        /** If there is some issue checking for admin status, just do nothing and the
         * error page will show up
          */
        catch (e) {
          console.log(e);
        }
      })();
    }, []);
  
    /** If the admin status check fails, just show an access denied page*/
    if (!admin) {
      return (
        <div
          style={{
            height: "90vh",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Alert header="Configuration error" type="error">
            You are not authorized to view this page!
          </Alert>
        </div>
      );
    }
  
    return (
      <BaseAppLayout
        contentType="cards"
        breadcrumbs={
          <BreadcrumbGroup
            onFollow={onFollow}
            items={[
              {
                text: CHATBOT_NAME,
                href: "/",
              },
              {
                text: "View Data",
                href: "/admin/configuration",
              },
            ]}
          />
        }
        content={
          <ContentLayout
            header={
              <Header
                variant="h1"
              >
                System Prompt Configuration
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
                    System Prompt
                  </Header>                
                }
              >
                <SpaceBetween size="xxs">
                The system prompt is the basic instruction the LLM uses to generate a response for any user query. It is integral to the LLM's behavior and should be set with care.
  
                <br></br>
        
                </SpaceBetween>
              </Container>
              <Tabs
                tabs={[
                    {
                    label: "Add System Prompt",
                    id: "add-prompt",
                    content: (
                        <NewPromptTab
                        tabChangeFunction={() => setActiveTab("add-prompt")}
                        documentType="prompt"
                        />
                    ),
                    },
                    {
                    label: "Set System Prompt",
                    id: "set-prompt",
                    content: (
                      <SetPromptTab 
                        tabChangeFunction={() => setActiveTab("set-prompt")}
                        documentType="prompt"
                      />
                    ),
                    },
                    {
                    label: "System Prompt Evaluation",
                    id: "add-test-cases",
                    // content: (
                    //     <TestCasesTab 
                    //     tabChangeFunction={() => setActiveTab("add-test-cases")}
                    //     />
                    // ),
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
  