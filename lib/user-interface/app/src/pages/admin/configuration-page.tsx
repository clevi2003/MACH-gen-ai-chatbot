import {
    BreadcrumbGroup,
    ContentLayout,
    Header,
    SpaceBetween,
    Alert,
    Button,
    Textarea
  } from "@cloudscape-design/components";
  import {
    Authenticator,
    Heading,
    useTheme,
  } from "@aws-amplify/ui-react";
  import BaseAppLayout from "../../components/base-app-layout";
  import useOnFollow from "../../common/hooks/use-on-follow";
  import { CHATBOT_NAME } from "../../common/constants";
  import { useState, useEffect } from "react";
  import { Auth } from "aws-amplify";
  
  export default function SystemPromptPage() {
    const onFollow = useOnFollow();
    const [promptText, setPromptText] = useState("");
    const [savedPrompt, setSavedPrompt] = useState<string | null>(null);
    const [admin, setAdmin] = useState<boolean>(false);
  
    /** Check if the signed-in user is an admin */
    useEffect(() => {
      (async () => {
        const result = await Auth.currentAuthenticatedUser();
        if (!result || Object.keys(result).length === 0) {
          console.log("Signed out!");
          Auth.signOut();
          return;
        }
  
        try {
          const result = await Auth.currentAuthenticatedUser();
          const admin = result?.signInUserSession?.idToken?.payload["custom:role"];
          if (admin) {
            const data = JSON.parse(admin);
            if (data.includes("Admin")) {
              setAdmin(true);
            }
          }
        } catch (e) {
          console.log(e);
        }
      })();
    }, []);
  
    const handleSavePrompt = () => {
      setSavedPrompt(promptText);
      setPromptText("");
    };
  
    /** If they are not an admin, show a page indicating so */
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
                text: "Set System Prompt",
                href: "/admin/system-prompt",
              },
            ]}
          />
        }
        content={
          <ContentLayout header={<Header variant="h1">Set System Prompt for LLM</Header>}>
            <SpaceBetween size="l">
              <Textarea
                placeholder="Enter your system prompt here..."
                value={promptText}
                onChange={(e) => setPromptText(e.detail.value)}
                rows={20}
              />
              <Button onClick={handleSavePrompt}>Save Prompt</Button>
              {savedPrompt && (
                <Alert header="Saved Prompt" type="info">
                  {savedPrompt}
                </Alert>
              )}
            </SpaceBetween>
          </ContentLayout>
        }
      />
    );
  }
  