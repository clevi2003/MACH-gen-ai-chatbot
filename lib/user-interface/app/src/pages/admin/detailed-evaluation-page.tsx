// src/pages/admin/detailed-evaluation-page.js

import React, { useState, useEffect, useContext } from "react";
import {
  Table,
  Header,
  Button,
  BreadcrumbGroup,
  Box,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useParams, useNavigate } from "react-router-dom";
import BaseAppLayout from "../../components/base-app-layout";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";
import { getColumnDefinition } from "./columns";
import { useNotifications } from "../../components/notif-manager";
import { AdminDataType } from "../../common/types";

export interface DetailedEvalProps {
    documentType: AdminDataType;
  }

function DetailedEvaluationPage(props: DetailedEvalProps) {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [evaluationDetails, setEvaluationDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();

  useEffect(() => {
    fetchEvaluationDetails();
  }, []);

  const fetchEvaluationDetails = async () => {
    setLoading(true);
    try {
      const result = await apiClient.evaluations.getEvaluationResults(
        evaluationId
      );
      setEvaluationDetails(result);
    } catch (error) {
      console.error(Utils.getErrorMessage(error));
      addNotification("error", "Error fetching evaluation details");
    }
    setLoading(false);
  };

  const breadcrumbItems = [
    { text: "LLM Evaluation", href: "/admin/llm-evaluation" },
    { text: `Evaluation ${evaluationId}`, href: "#" },
  ];

  const columnDefinitions = getColumnDefinition(props.documentType);

  return (
    <BaseAppLayout
      content={
        <>
          <BreadcrumbGroup items={breadcrumbItems} />
          <Header
            variant="h1"
            actions={
              <Button onClick={() => navigate(-1)} variant="link">
                Back to Evaluations
              </Button>
            }
          >
            Evaluation Details
          </Header>
          <Table
            loading={loading}
            loadingText="Loading evaluation details"
            items={evaluationDetails}
            columnDefinitions={columnDefinitions}
            trackBy="question_id"
            empty={
              <Box textAlign="center">
                <StatusIndicator type="warning">
                  No details found for this evaluation.
                </StatusIndicator>
              </Box>
            }
            header={<Header>Detailed Results</Header>}
          />
        </>
      }
    />
  );
}

export default DetailedEvaluationPage;
