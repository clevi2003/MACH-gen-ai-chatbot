import {
  BreadcrumbGroup,
  ContentLayout,
  Header,
  SpaceBetween,
  Alert,
  Button,
  Textarea,
} from "@cloudscape-design/components";
import { useState, useEffect, useContext } from "react";
import { Auth } from "aws-amplify";
import BaseAppLayout from "../../components/base-app-layout";
import useOnFollow from "../../common/hooks/use-on-follow";
import { CHATBOT_NAME } from "../../common/constants";
import { ApiClient } from "../../common/api-client/api-client"; 
import { AppContext } from "../../common/app-context";
import { AppConfig } from "../../common/types"; 
import { Utils } from "../../common/utils";

export default function SystemPromptPage() {
  const onFollow = useOnFollow();
  const [promptText, setPromptText] = useState("");
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null);
  const [admin, setAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const appContext = useContext(AppContext);
  const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || ""; // Ensure this environment variable is set
  const apiClient = new ApiClient(appContext);

  /** Check if the signed-in user is an admin */
  useEffect(() => {
    (async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result) {
          console.log("Signed out!");
          Auth.signOut();
          return;
        }
        const role = result?.signInUserSession?.idToken?.payload["custom:role"];
        if (role) {
          const roles = JSON.parse(role);
          if (roles.includes("Admin")) {
            setAdmin(true);
          }
        }
      } catch (e) {
        console.error("Error checking admin status:", e);
        Auth.signOut();
      }
    })();
  }, []);

  /** Fetch the current system prompt */
  useEffect(() => {
    if (!admin) return;

    (async () => {
      try {
        const response = await apiClient.knowledgeManagement.getCurrentSystemPrompt();
        setPromptText(response.prompt || "");
        setLoading(false);
      } catch (error) {
        console.error("Error fetching current system prompt:", error);
        setError("Failed to fetch the current system prompt.");
        setLoading(false);
      }
    })();
  }, [admin]);

  const handleSavePrompt = async () => {
    try {
      setLoading(true);
      await apiClient.knowledgeManagement.setSystemPrompt(promptText);
      setSavedPrompt(promptText);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error("Error saving system prompt:", error);
      setError("Failed to save the system prompt.");
      setLoading(false);
    }
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
        <Alert header="Access Denied" type="error">
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
        <ContentLayout
          header={<Header variant="h1">Set System Prompt for LLM</Header>}
        >
          <SpaceBetween size="l">
            {error && (
              <Alert header="Error" type="error">
                {error}
              </Alert>
            )}
            <Textarea
              placeholder="Enter your system prompt here..."
              value={promptText}
              onChange={(e) => setPromptText(e.detail.value)}
              rows={20}
              disabled={loading}
            />
            <Button onClick={handleSavePrompt} disabled={loading}>
              {loading ? "Saving..." : "Save Prompt"}
            </Button>
            {savedPrompt && (
              <Alert header="Prompt Saved Successfully" type="success">
                Your system prompt has been updated.
              </Alert>
            )}
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
