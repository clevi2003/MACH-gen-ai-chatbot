import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  SpaceBetween,
  Table,
  Pagination,
  Button,
  Header,
  StatusIndicator,
  Select,
  SelectProps,
} from "@cloudscape-design/components";
import { Utils } from "../../../common/utils";
import { AppContext } from "../../../common/app-context";
import { ApiClient } from "../../../common/api-client/api-client";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useNotifications } from "../../../components/notif-manager";
import { getColumnDefinition } from "../columns";
import { useNavigate } from "react-router-dom";
import { AdminDataType } from "../../../common/types";

const findFirstSortableColumn = (columns) => {
  return columns.find(col => col.sortingField && !col.disableSort) || columns[0];
};


export interface PastEvalsTabProps {
  tabChangeFunction: () => void;
  documentType: AdminDataType;
}

export default function PastEvalsTab(props: PastEvalsTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState([]);
  const { addNotification } = useNotifications();
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState([]);
  const needsRefresh = useRef(false);
  const [testCaseFiles, setTestCaseFiles] = useState<SelectProps.Option[]>([]);
  const [selectedTestCaseFile, setSelectedTestCaseFile] = useState<SelectProps.Option | null>(null);
  const columnDefinitions = getColumnDefinition(props.documentType);
  const defaultSortingColumn = findFirstSortableColumn(columnDefinitions);
  const currentPageItems = pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Items || [];

  const { items, collectionProps, paginationProps } = useCollection(
    currentPageItems,
    {
      sorting: {
        defaultState: {
          sortingColumn: defaultSortingColumn,
          isDescending: false,
        },
      },
    }
  );

  /** Function to get evaluations from api*/
  const getEvaluations = useCallback(
    async (params : { pageIndex?: number, nextPageToken? }) => {
      setLoading(true);
      try {
        const testCaseFileName = selectedTestCaseFile?.value;
        const result = await apiClient.evaluations.getEvaluationSummaries(params.nextPageToken, 10, testCaseFileName);
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
      } catch (error) {
        console.error(Utils.getErrorMessage(error));
        addNotification("error", "Error fetching evaluations");
      } finally {
        setLoading(false);
      }
    },
    [apiClient, addNotification, selectedTestCaseFile]
  );

  useEffect(() => {
    const fetchTestCaseFiles = async () => {
      try {
        const result = await apiClient.evaluations.getDocuments();
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
  

  useEffect(() => {
    setCurrentPageIndex(1);
    if (needsRefresh.current) {
      getEvaluations({ pageIndex: 1 });
    } else {
      getEvaluations({ pageIndex: currentPageIndex });
    }
  }, [getEvaluations, selectedTestCaseFile]);
  

  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.NextPageToken;
    if (continuationToken) {
      if (pages.length <= currentPageIndex || needsRefresh.current) {
        await getEvaluations({ nextPageToken: continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };

  
  const onPreviousPageClick = () => {
    setCurrentPageIndex((current) => Math.max(1, current - 1));
  };


  return (
    <Table
      {...collectionProps}
      loading={loading}
      loadingText={"Loading evaluations"}
      columnDefinitions={columnDefinitions}
      items={items}
      trackBy="evaluation_id"
      sortingColumn={collectionProps.sortingColumn || defaultSortingColumn}
      sortingDescending={collectionProps.sortingDescending}
      onSortingChange={(event) => {
      collectionProps.onSortingChange(event);
      }}
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Select
                placeholder="Filter by test case file"
                selectedOption={selectedTestCaseFile}
                onChange={({ detail }) => setSelectedTestCaseFile(detail.selectedOption)}
                options={testCaseFiles}
              />
              <Button iconName="refresh" onClick={() => getEvaluations({ pageIndex: currentPageIndex })} />
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
  );
}
