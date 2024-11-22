import React, { useState, useEffect, useMemo, useContext, useCallback, useRef } from "react";
import {
  SpaceBetween,
  Container,
  Alert,
  ProgressBar,
  Grid,
  LineChart,
  Header,
  Select,
  SelectProps,
} from "@cloudscape-design/components";
import { Auth } from "aws-amplify";
import { Utils } from "../../../common/utils";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useNotifications } from "../../../components/notif-manager";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import { LineChartProps } from "@cloudscape-design/components/line-chart"; // Import LineChartProps

export interface CurrentEvalTabProps {
  tabChangeFunction: () => void;
}

export default function CurrentEvalTab(props: CurrentEvalTabProps) {
  const appContext = useContext(AppContext);
  const [metrics, setMetrics] = useState<any>({});
  const [admin, setAdmin] = useState<boolean>(false);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();
  const needsRefresh = useRef(false);
  const [pages, setPages] = useState([]);
  const [activePrompts, setActivePrompts] = useState([]);
  const [testCaseFiles, setTestCaseFiles] = useState<SelectProps.Option[]>([]);
  const [selectedTestCaseFile, setSelectedTestCaseFile] = useState<SelectProps.Option | null>(null);


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

  // Fetch Evaluations
  const getEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      const testCaseFileName = selectedTestCaseFile?.value;
      const result = await apiClient.evaluations.getEvaluationSummaries(undefined, 10, testCaseFileName);
      // Take only the last 10 evaluations
      const firstTenEvaluations = result.Items.slice(0, 10);
      setEvaluations(firstTenEvaluations);
    } catch (error) {
      console.error(Utils.getErrorMessage(error));
      addNotification("error", "Error fetching evaluations");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification, selectedTestCaseFile]);

  // Fetch Active Prompts
  const getActivePrompts = useCallback(async () => {
    try {
      const result = await apiClient.knowledgeManagement.listActiveSystemPrompts();
      // Assume result.prompts is an array of prompts with Timestamps
      if (result.prompts && result.prompts.length > 1) {
        // Sort prompts by Timestamp ascending
        const sortedPrompts = result.prompts.sort(
          (a, b) => new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime()
        );
        // Exclude the oldest prompt
        const promptsExcludingOldest = sortedPrompts.slice(1);
        setActivePrompts(promptsExcludingOldest);
      } else {
        setActivePrompts([]);
      }
    } catch (error) {
      console.error("Error fetching active prompts:", error);
      addNotification("error", "Error fetching active prompts");
    }
  }, [apiClient, addNotification]);

  useEffect(() => {
    getEvaluations();
  }, [getEvaluations, getActivePrompts, selectedTestCaseFile]);

  useEffect(() => {
    (async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result || Object.keys(result).length === 0) {
          console.log("Signed out!");
          Auth.signOut();
          return;
        }

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

  useEffect(() => {
    const fetchTestCaseFiles = async () => {
      try {
        const result = await apiClient.evaluations.getDocuments();
        // if 
        // Assuming result.Contents is an array of file metadata
        const options = result.Contents.map((file) => ({
          label: file.Key,
          value: file.Key,
        }));
        setTestCaseFiles(options);
      } catch (error) {
        console.error("Error fetching test case files:", error);
        addNotification("error", "Error fetching test case files");
      }
    };
  
    fetchTestCaseFiles();
  }, [apiClient, addNotification]);
  

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

  const xMin = Math.min(...items.map(i => new Date(i.Timestamp).getTime()));
  const xMax = Math.max(...items.map(i => new Date(i.Timestamp).getTime()));

  // Sample scores
  const last_entry = items[0];
  const acc_score = parseFloat(last_entry["average_correctness"]) * 100; // Score out of 100
  const rel_score = parseFloat(last_entry["average_relevance"]) * 100; // Score out of 100
  const sim_score = parseFloat(last_entry["average_similarity"]) * 100; // Score out of 100

  // Create arrays for accuracy, relevancy, and similarity data based on items
  const accuracyData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: parseFloat(item["average_correctness"]) * 100, // Score out of 100
  }));

  const relevancyData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: parseFloat(item["average_relevance"]) * 100,
  }));

  const similarityData = items.map((item, index) => ({
    x: new Date(item.Timestamp).getTime(),
    y: parseFloat(item["average_similarity"]) * 100,
  }));

  // Create vertical threshold lines for prompt changes
  let promptChangeThresholds = activePrompts.map(
    (prompt, index) => ({
      title: "System Prompt Change",
      type: 'threshold' as const,
      x: new Date(prompt.Timestamp).getTime(),
      label: "Prompt Change",
    })
  );
  // filter to only include prompts within the xDomain
  promptChangeThresholds = promptChangeThresholds.filter((threshold) => threshold.x >= xMin && threshold.x <= xMax);

  // Define your data series with explicit types
  const accuracySeries = {
    title: "Accuracy",
    type: 'line' as const,
    data: accuracyData,
  };

  const relevancySeries = {
    title: "Relevancy",
    type: 'line' as const,
    data: relevancyData,
  };

  const similaritySeries = {
    title: "Similarity",
    type: 'line' as const,
    data: similarityData,
  };

  // Combine all series
  const allSeries = [
    accuracySeries,
    relevancySeries,
    similaritySeries,
    ...promptChangeThresholds,
  ];

  // Determine xDomain and yDomain
  const xValues = items.map((i) => new Date(i.Timestamp).getTime());
  const yDomain = [50, 100]; // Adjust based on the data range
  console.log("xMin: ", xMin, "xMax: ", xMax);
  console.log("XValues: ", xValues);
  console.log("items: ", items);
  console.log("promptChangeThresholds: ", promptChangeThresholds);
  console.log("activePrompts: ", activePrompts);

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
            resultText={`${acc_score.toFixed(2)}%`}
          />
        </Container>
        <Container header={<Header variant="h3">Relevancy</Header>}>
          <ProgressBar
            value={rel_score}
            description="Answer Relevancy looks at the generated answer and uses an LLM to guess what questions it may be answering. The better the LLM guesses the original question, the more relevant the generated answer is"
            resultText={`${rel_score.toFixed(2)}%`}
          />
        </Container>
        <Container header={<Header variant="h3">Similarity</Header>}>
          <ProgressBar
            value={sim_score}
            description="Answer Similarity looks only at the semantic similarity of the expected answer and the LLM generated answer by finding the cosine similarity between the two answers and converting it into a score"
            resultText={`${sim_score.toFixed(2)}%`}
          />
        </Container>
      </Grid>

      {/* Combined Line Chart for All Metrics */}
      <Container header={<Header variant="h3">Metrics Over Time (10 Most Recent Evaluations)</Header>}>
        <Select
          placeholder="Select a test case file"
          selectedOption={selectedTestCaseFile}
          onChange={({ detail }) => setSelectedTestCaseFile(detail.selectedOption)}
          options={testCaseFiles}
        />
        <LineChart
          series={allSeries}
        //   xDomain={[xMin, xMax]}
        //   yDomain={yDomain}
        //   xScaleType="time"
          xTitle="Time"
          yTitle="Percentage (%)"
          i18nStrings={{
            legendAriaLabel: "Legend",
            chartAriaRoleDescription: "line chart",
            xTickFormatter: (value) =>
              new Date(value)
                .toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                  hour12: false,
                })
                .split(",")
                .join("\n"),
            yTickFormatter: (value) => `${value.toFixed(0)}%`,
          }}
          ariaLabel="Metrics over time"
        />
      </Container>
    </SpaceBetween>
  );
}
