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
  import CurrentEvalTab from "./current-eval-tab";
  import NewEvalTab from "./new-eval-tab";
  import PastEvalsTab from "./past-evals-tab";
  import DocumentsTab from "./documents-tab";
  import { CHATBOT_NAME } from "../../common/constants";
  import { useState, useEffect, useContext } from "react";
  import { Auth } from "aws-amplify";
  import DataFileUpload from "./file-upload-tab";
  import { ApiClient } from "../../common/api-client/api-client";
  import { AppContext } from "../../common/app-context";
  
  export default function LlmEvaluationPage() {
    const onFollow = useOnFollow();
    const [admin, setAdmin] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState("file");
    const appContext = useContext(AppContext);
    const apiClient = new ApiClient(appContext);
    const [lastSyncTime, setLastSyncTime] = useState("")
    const [showUnsyncedAlert, setShowUnsyncedAlert] = useState(false);
  
    /** Function to get the last synced time */
    const refreshSyncTime = async () => {
      try {
        const lastSync = await apiClient.knowledgeManagement.lastKendraSync();    
        setLastSyncTime(lastSync);
      } catch (e) {
        console.log(e);
      }
    }
  
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
                href: "/admin/llm-evaluation",
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
                Llm Evaluation Dashboard
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
                    Last successful sync: {lastSyncTime}
                  </Header>                
                }
              >
                <SpaceBetween size="xxs">
                View past evaluations and run new evaluations for the llm's RAG performance.
  
                <br></br>
        
                </SpaceBetween>
              </Container>
              <Tabs
                tabs={[
                    {
                    label: "Current Evaluation",
                    id: "current-eval",
                    content: (
                        <CurrentEvalTab
                        tabChangeFunction={() => setActiveTab("current-eval")}
                        />
                    ),
                    },
                    {
                    label: "Past Evaluations",
                    id: "past-evals",
                    content: (
                      <PastEvalsTab 
                        tabChangeFunction={() => setActiveTab("past-evals")}
                        documentType="evaluationSummary"
                      />
                    ),
                    },
                    {
                    label: "New Evaluation",
                    id: "new-eval",
                    content: (
                        <NewEvalTab 
                        tabChangeFunction={() => setActiveTab("new-eval")}
                        />
                    ),
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
  