import React, { useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  SpaceBetween,
  Table,
  Pagination,
  Button,
  Header,
  StatusIndicator,
} from "@cloudscape-design/components";
import { Utils } from "../../common/utils";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useNotifications } from "../../components/notif-manager";
import { getColumnDefinition } from "./columns";
import { useNavigate } from "react-router-dom";
import { AdminDataType } from "../../common/types";

export interface PastEvalsTabProps {
  tabChangeFunction: () => void;
  documentType: AdminDataType;
}

export default function PastEvalsTab(props: PastEvalsTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState([]);
  const navigate = useNavigate();
  const { addNotification } = useNotifications();

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

  /** Function to get evaluations */
  const getEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.evaluations.getEvaluationSummaries();
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

  /** View detailed evaluation */
  const viewDetailedEvaluation = (evaluationId: string) => {
    navigate(`/admin/llm-evaluation/${evaluationId}`);
  };

  const columnDefinitions = getColumnDefinition(props.documentType);

  return (
    <Table
      {...collectionProps}
      loading={loading}
      loadingText={"Loading evaluations"}
      columnDefinitions={columnDefinitions}
      items={items}
      trackBy="evaluation_id"
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" onClick={getEvaluations} />
            </SpaceBetween>
          }
        >
          {"Past Evaluations"}
        </Header>
      }
      empty={
        <Box textAlign="center">
          <StatusIndicator type="warning">No evaluations found</StatusIndicator>
        </Box>
      }
      pagination={<Pagination {...paginationProps} />}
    />
  );
}
