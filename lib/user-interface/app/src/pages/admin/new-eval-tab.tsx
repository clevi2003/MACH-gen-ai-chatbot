import {
    Box,
    Button,
    Container,
    Form,
    Header,
    Input,
    Pagination,
    SpaceBetween,
    Table,
  } from "@cloudscape-design/components";
  import { useCallback, useContext, useEffect, useState } from "react";
  import { AppContext } from "../../common/app-context";
  import { ApiClient } from "../../common/api-client/api-client";
  import { Utils } from "../../common/utils";
  import { useNotifications } from "../../components/notif-manager";
  import { useCollection } from "@cloudscape-design/collection-hooks";
  import { getColumnDefinition } from "./columns";
  import { AdminDataType } from "../../common/types";
  
  export interface FileUploadTabProps {
    tabChangeFunction: () => void;
    documentType: AdminDataType;
  }
  
  export default function NewEvalTab(props: FileUploadTabProps) {
    const appContext = useContext(AppContext);
    const apiClient = new ApiClient(appContext);
    const { addNotification } = useNotifications();
  
    const [evalName, setEvalName] = useState<string>("SampleEvalName");
    const [globalError, setGlobalError] = useState<string | undefined>(undefined);
  
    const [loading, setLoading] = useState(true);
    const [currentPageIndex, setCurrentPageIndex] = useState(1);
    const [pages, setPages] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<any | null>(null);
  
    const { items, collectionProps, paginationProps } = useCollection(pages, {
      filtering: {
        empty: (
          <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
            <SpaceBetween size="m">
              <b>No files</b>
            </SpaceBetween>
          </Box>
        ),
      },
      pagination: { pageSize: 5 },
      sorting: {
        defaultState: {
          sortingColumn: {
            sortingField: "Key",
          },
          isDescending: true,
        },
      },
      selection: {},
    });
  
    const onNewEvaluation = () => {
      if (evalName === "SampleEvalName" || evalName.trim() === "") {
        setGlobalError("Please enter a name for the evaluation");
        return;
      }
      if (!selectedFile) {
        setGlobalError("Please select a file for evaluation");
        return;
      }
      try {
        apiClient.evaluations.startNewEvaluation(evalName, selectedFile.Key);
        addNotification("success", "Evaluation started successfully.");
      } catch (error) {
        console.error(Utils.getErrorMessage(error));
        addNotification("error", "Error starting new evaluation. Please try again.");
      }
    };
  
    /** Function to get documents */
    const getDocuments = useCallback(
        async (params: { continuationToken?: string; pageIndex?: number }) => {
        setLoading(true);
        try {
            const result = await apiClient.evaluations.getDocuments(params?.continuationToken, params?.pageIndex)
            // await props.statusRefreshFunction();
            setPages((current) => {
            if (typeof params.pageIndex !== "undefined") {
                current[params.pageIndex - 1] = result;
                return [...current];
            } else {
                return [...current, result];
            }
            });
        } catch (error) {
            console.error(Utils.getErrorMessage(error));
        }

        console.log(pages);
        setLoading(false);
        },
        [appContext, props.documentType]
    );

    /** Whenever the memoized function changes, call it again */
    useEffect(() => {
        getDocuments({});
    }, [getDocuments]);

    /** Handle clicks on the next page button, as well as retrievals of new pages if needed*/
    const onNextPageClick = async () => {
        const continuationToken = pages[currentPageIndex - 1]?.NextContinuationToken;

        if (continuationToken) {
        if (pages.length <= currentPageIndex) {
            await getDocuments({ continuationToken });
        }
        setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
        }
    };

    /** Handle clicks on the previous page button */
    const onPreviousPageClick = async () => {
        setCurrentPageIndex((current) =>
        Math.max(1, Math.min(pages.length - 1, current - 1))
        );
    };

    /** Handle refreshes */
    const refreshPage = async () => {
        // console.log(pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Contents!)
        if (currentPageIndex <= 1) {
        await getDocuments({ pageIndex: currentPageIndex });
        } else {
        const continuationToken = pages[currentPageIndex - 2]?.NextContinuationToken!;
        await getDocuments({ continuationToken });
        }
    };
  
    const columnDefinitions = getColumnDefinition(props.documentType);
  
    return (
      <>
        <Form errorText={globalError}>
          <SpaceBetween size="l">
            <Container>
              <SpaceBetween direction="horizontal" size="s">
                <label style={{ alignSelf: 'center' }}>Evaluation Name:</label>
                <Input
                  value={evalName}
                  placeholder="SampleEvalName"
                  onChange={(event) => setEvalName(event.detail.value)}
                />
                <Button
                  data-testid="new-evaluation"
                  variant="primary"
                  onClick={onNewEvaluation}
                  disabled={!selectedFile}
                >
                  Create New Evaluation
                </Button>
                <div hidden={!selectedFile} style={{ paddingTop: "s" }}>
                  {/** Calculate the cost: bytes *  4 bytes/token * 1 kilotoken/ 1000 tokens * $0.00020 / output kilotoken * 3 metrics */}
                    <b>Estimated Cost:</b> ${(selectedFile?.Size / 1000 / 4 * 0.0020 * 4).toFixed(4)}
                </div>
              </SpaceBetween>
            </Container>
  
            {/* Adding space between the container and table */}
            <Box padding={{ top: "xxs" }} />
  
            {/* Table Section */}
            <Table
              {...collectionProps}
              loading={loading}
              loadingText={`Loading files`}
              columnDefinitions={columnDefinitions}
              selectionType="single"
              onSelectionChange={({ detail }) => {
                const clickedFile = detail.selectedItems[0];
                setSelectedFile((prev) => (clickedFile && prev && clickedFile.Key === prev.Key ? null : clickedFile));
              }}
              selectedItems={selectedFile ? [selectedFile] : []}
              items={pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Contents!}
              trackBy="Key"
              header={
                <Header
                  actions={
                    <Button iconName="refresh" onClick={refreshPage} />
                  }
                  description="Please select a test case file for your next evaluation. Press the refresh button to see the latest test case files."
                >
                  {"Files"}
                </Header>
              }
              empty={<Box textAlign="center">No test case files uploaded. Please upload a test case file before running an evaluation.</Box>}
              pagination={
                pages.length > 0 && (
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
          </SpaceBetween>
        </Form>
      </>
    );
  }
  