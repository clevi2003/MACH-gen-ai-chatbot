// src/pages/admin/detailed-evaluation-page.js

import React, { useState, useEffect, useContext, useRef } from "react";
import {
  Table,
  Header,
  Button,
  BreadcrumbGroup,
  Box,
  Pagination,
  StatusIndicator,
} from "@cloudscape-design/components";
import { useParams, useNavigate } from "react-router-dom";
import BaseAppLayout from "../../components/base-app-layout";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";
import { getColumnDefinition } from "./columns";
import { useNotifications } from "../../components/notif-manager";
import { useCollection } from "@cloudscape-design/collection-hooks";
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
  const [evaluationName, setEvaluationName] = useState("");
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState([]);
  const needsRefresh = useRef(false);


  useEffect(() => {
    setCurrentPageIndex(1);
    fetchEvaluationDetails({ pageIndex: 1 });
  }, [evaluationId]);
  

  const fetchEvaluationDetails = async (params : { pageIndex?: number, nextPageToken? }) => {
    setLoading(true);
    try {
      const result = await apiClient.evaluations.getEvaluationResults(evaluationId, params.nextPageToken);
      setPages((current) => {
        if (needsRefresh.current) {
          needsRefresh.current = false;
          return [result];
        }
        if (typeof params.pageIndex !== "undefined") {
          current[params.pageIndex - 1] = result;
          return [...current];
        } else {
          return [...current, result];
        }
      });
      if (result.Items && result.Items.length > 0) {
        setEvaluationName(result.Items[0].evaluation_name);
      }
    } catch (error) {
      console.error(Utils.getErrorMessage(error));
      addNotification("error", "Error fetching evaluation details");
    } finally {
      setLoading(false);
    }
  };

  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.NextPageToken;
    if (continuationToken) {
      if (pages.length <= currentPageIndex || needsRefresh.current) {
        await fetchEvaluationDetails({ nextPageToken: continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };
  
  const onPreviousPageClick = () => {
    setCurrentPageIndex((current) => Math.max(1, current - 1));
  };

  const breadcrumbItems = [
    { text: "LLM Evaluation", href: "/admin/llm-evaluation" },
    // text should be Evaluation {evaluation name}
    { text: `Evaluation ${evaluationName}`, href: "#" },
    // { text: `Evaluation ${evaluationId}`, href: "#" },
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
            items={pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Items || []}
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
            pagination={
              pages.length === 0 ? null : (
                <Pagination
                  openEnd={true}
                  pagesCount={pages.length}
                  currentPageIndex={currentPageIndex}
                  onNextPageClick={onNextPageClick}
                  onPreviousPageClick={onPreviousPageClick}
                />
              )
            }
          />
        </>
      }
    />
  );
}

export default DetailedEvaluationPage;
