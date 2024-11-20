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
import { Utils } from "../../../common/utils";
import useOnFollow from "../../../common/hooks/use-on-follow";
import FeedbackTab from "../feedback-tab";
import FeedbackPanel from "../../../components/feedback-panel";
import { CHATBOT_NAME } from "../../../common/constants";
import { getColumnDefinition } from "../columns";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useState, useEffect, useMemo, useContext, useCallback, useRef } from "react";
import { useNotifications } from "../../../components/notif-manager";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../../common/api-client/api-client"; 
import { AppContext } from "../../../common/app-context";

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
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();
  const needsRefresh = useRef(false);
  const [pages, setPages] = useState([]);

  const { items, collectionProps, paginationProps } = useCollection(evaluations, {
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


  const getEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.evaluations.getEvaluationSummaries();
      console.log("result: ", result);
      
      // Take only the first 10 evaluations
      const firstTenEvaluations = result.Items.slice(0, 10)
      
      // Update state with just these evaluations
      setEvaluations(firstTenEvaluations);
    } catch (error) {
      console.error(Utils.getErrorMessage(error));
      addNotification("error", "Error fetching evaluations");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification]

);
  

  
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

  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (items.length === 0) {
    console.log("items: ", items);
    return <div>No evaluations found.</div>;
  }


  // Sample scores
  const last_entry = items[0];
  const acc_score = last_entry['average_correctness'] * 100; // Score out of 100
  const rel_score = last_entry['average_relevance'] * 100; // Score out of 100
  const sim_score = last_entry['average_similarity'] * 100; // Score out of 100

  // Create arrays for accuracy, relevancy, and similarity data based on items
  const accuracyData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: item['average_correctness'] * 100 // Score out of 100
  }));

  const relevancyData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: item['average_relevance'] * 100
  }));

  const similarityData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: item['average_similarity'] * 100
  }));

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
                  description="Answer Correctness breaks down answers into different factual statements and looks at the overlap of statements in the expected answer given in a test case and the generated answer from the LLM"
                  resultText={`${acc_score}%`}
                />
              </Container>
              <Container header={<Header variant="h3">Relevancy</Header>}>
                <ProgressBar
                  value={rel_score}
                  description="Answer Relevancy looks at the generated answer and uses an LLM to guess what questions it may be answering. The better the LLM guesses the original question, the more relevant the generated answer is"
                  resultText={`${rel_score}%`}
                />
              </Container>
              <Container header={<Header variant="h3">Similarity</Header>}>
                <ProgressBar
                  value={sim_score}
                  description="Answer Similarity looks only at the semantic similarity of the expected answer and the LLM generated answer by finding the cosine similarity between the two answers and converting it into a score"
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
                xDomain={[
                  Math.min(...items.map(i => new Date(i.Timestamp).getTime())), 
                  Math.max(...items.map(i => new Date(i.Timestamp).getTime()))
                ]}
                yDomain={[50, 100]}// Adjust based on the data range
                //xTickValues={[1, 2, 3, 4, 5]}
                i18nStrings={{
                  legendAriaLabel: "Legend",
                  chartAriaRoleDescription: "line chart",
                  xTickFormatter: value =>
                    new Date(value)
                      .toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                        hour12: false
                      })
                      .split(",")
                      .join("\n"),
                  yTickFormatter: value => `${value.toFixed(0)}%`,
                }}
                ariaLabel="Metrics over time"
              />
            </Container>
          </SpaceBetween>
  )
}
