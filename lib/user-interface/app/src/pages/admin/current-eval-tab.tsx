import {
  BreadcrumbGroup,
  ContentLayout,
  Header,
  SpaceBetween,
  Container,
  Alert,
  ProgressBar,
  Grid,
  LineChart,
} from "@cloudscape-design/components";
import { Authenticator, Heading, useTheme } from "@aws-amplify/ui-react";
import { Utils } from "../../common/utils";
import useOnFollow from "../../common/hooks/use-on-follow";
import FeedbackTab from "./feedback-tab";
import FeedbackPanel from "../../components/feedback-panel";
import { CHATBOT_NAME } from "../../common/constants";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useState, useEffect, useMemo, useContext, useCallback } from "react";
import { useNotifications } from "../../components/notif-manager";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client"; 
import { AppContext } from "../../common/app-context";

export interface CurrentEvalTabProps {
  tabChangeFunction: () => void;
}


export default function CurrentEvalTab(props: CurrentEvalTabProps) {
  const appContext = useContext(AppContext)
  const onFollow = useOnFollow();
  const { tokens } = useTheme();
  const [metrics, setMetrics] = useState<any>({});
  const [admin, setAdmin] = useState<boolean>(false);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext])
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();

  const { items } = useCollection(evaluations, {
    pagination: { pageSize: 10 },
    sorting: {
      defaultState: {
        sortingColumn: {
          sortingField: "timestamp",
        },
        isDescending: true,
      },
    },
  });

  /** Function to get evaluations */
  const getEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.evaluations.getEvaluationSummaries();
      console.log("results from api: ", result);
      setEvaluations(result);
    } catch (error) {
      console.log("error: ", error);
      console.error(Utils.getErrorMessage(error));
      addNotification("error", "Error fetching evaluations");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification]);
  
  useEffect(() => {
    getEvaluations();
  }, [getEvaluations]);

  useEffect(() => {
    (async () => {
      const result = await Auth.currentAuthenticatedUser();
      if (!result || Object.keys(result).length === 0) {
        console.log("Signed out!")
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
      }
      catch (e){
        console.log(e);
      }
    })();
  }, []);

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


  // Sample scores
  const last_entry = items[0];
  console.log("last entry: ", last_entry);
  console.log(typeof last_entry);
  const acc_score = last_entry['average_correctness']; // Score out of 100
  const rel_score = last_entry['average_relevance']; // Score out of 100
  const sim_score = last_entry['average_similarity']; // Score out of 100

  // Sample data for the combined line chart with time on the x-axis
  const accuracyData = [
    { x: 1, y: 80 },
    { x: 2, y: 85 },
    { x: 3, y: 83 },
    { x: 4, y: 87 },
    { x: 5, y: 90 },
  ];

  const relevancyData = [
    { x: 1, y: 55 },
    { x: 2, y: 60 },
    { x: 3, y: 62 },
    { x: 4, y: 58 },
    { x: 5, y: 63 },
  ];

  const similarityData = [
    { x: 1, y: 88 },
    { x: 2, y: 89 },
    { x: 3, y: 90 },
    { x: 4, y: 92 },
    { x: 5, y: 91 },
  ];

  return (    
          <SpaceBetween size="xxl" direction="vertical">
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xs: 4 } },
                { colspan: { default: 12, xs: 4 } },
                { colspan: { default: 12, xs: 4 } },
              ]}
            >
              <Container header={<Header variant="h3">Accuracy</Header>}>
                <ProgressBar
                  value={acc_score}
                  description="Correctness of a given answer"
                  resultText={`${acc_score}%`}
                />
              </Container>
              <Container header={<Header variant="h3">Relevancy</Header>}>
                <ProgressBar
                  value={rel_score}
                  description="Is the generated answer relevant for the question that was asked"
                  resultText={`${rel_score}%`}
                />
              </Container>
              <Container header={<Header variant="h3">Similarity</Header>}>
                <ProgressBar
                  value={sim_score}
                  description="How semantically similar is the generated answer to the expected output"
                  resultText={`${sim_score}%`}
                />
              </Container>
            </Grid>

            {/* Combined Line Chart for All Metrics */}
            <Container header={<Header variant="h3">Metrics Over Time</Header>}>
              <LineChart
                series={[
                  { title: "Accuracy", type: "line", data: accuracyData },
                  { title: "Relevancy", type: "line", data: relevancyData },
                  { title: "Similarity", type: "line", data: similarityData },
                ]}
                xDomain={[1, 5]}
                yDomain={[50, 100]}// Adjust based on the data range
                //xTickValues={[1, 2, 3, 4, 5]}
                i18nStrings={{
                  legendAriaLabel: "Legend",
                  chartAriaRoleDescription: "line chart",
                  xTickFormatter: value => value.toString(),
                  yTickFormatter: value => `${(value).toFixed(0)}%`,
                }}
                ariaLabel="Metrics over time"
              />
            </Container>
          </SpaceBetween>
  )
}
